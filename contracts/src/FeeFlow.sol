// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {FeeSink} from "./FeeSink.sol";
import {IPonsFactory, LaunchedToken} from "./interfaces/IPons.sol";

/// @title FeeFlow
/// @notice Routes Pons v2 creator fees to the X account bound to each token. Non-upgradeable,
///         non-custodial: there is no admin path to balances, no fee setter, no window setter,
///         no recipient setter and no way to change a token's binding.
/// @dev Pair asset `address(0)` means native ETH.
contract FeeFlow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ constants
    uint256 public constant FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant CLAIM_WINDOW = 30 days;
    address public constant NATIVE = address(0);

    bytes32 public constant ROUTE_TYPEHASH =
        keccak256("Route(address token,uint64 xUserId,uint256 deadline)");
    bytes32 public constant REGISTER_TYPEHASH =
        keccak256("Register(address token,uint64 xUserId,uint256 nonce,uint256 expiry)");
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(uint64 xUserId,address to,uint256 nonce,uint256 expiry)");
    bytes32 public constant EXIT_TYPEHASH =
        keccak256("Exit(uint64 xUserId,address token,address newRecipient,uint256 nonce,uint256 expiry)");

    // ------------------------------------------------------------------ immutables
    IPonsFactory public immutable FACTORY;
    address public immutable ESCROW;
    address public immutable FEE_RECIPIENT;
    address public immutable ADMIN;
    uint256 public immutable ATTESTER_TIMELOCK;
    address public immutable SINK_IMPLEMENTATION;

    // ------------------------------------------------------------------ types
    enum ExitRole {
        Handle,
        Creator
    }

    struct TokenInfo {
        address sink;
        uint64 xUserId;
        uint64 routedAt;
        bool exited;
        address creator;
        address asset;
    }

    struct Batch {
        uint128 amount;
        uint64 creditedAt;
    }

    struct Totals {
        uint256 collectedGross;
        uint256 feesTaken;
        uint256 credited;
        uint256 claimed;
        uint256 expiredToCreators;
        uint256 feesWithdrawn;
    }

    struct RegisterParams {
        address token;
        uint64 xUserId;
        address creator;
        uint256 creatorDeadline;
        uint256 nonce;
        uint256 expiry;
    }

    // ------------------------------------------------------------------ storage
    address public attester;
    address public pendingAttester;
    uint256 public pendingAttesterEta;
    bool public registrationPaused;

    mapping(address token => TokenInfo) internal _tokens;
    mapping(address sink => address token) public tokenOfSink;
    mapping(address token => mapping(uint256 index => Batch)) internal _batches;
    mapping(address token => uint256) public batchHead;
    mapping(address token => uint256) public batchTail;
    mapping(address token => uint256) public credited;
    mapping(address asset => uint256) public accruedFees;
    mapping(address asset => Totals) internal _totals;
    mapping(uint256 nonce => bool) public nonceUsed;

    // ------------------------------------------------------------------ events
    event TokenRegistered(
        address indexed token, uint64 indexed xUserId, address indexed creator, address sink, address asset
    );
    event Collected(
        address indexed token,
        uint64 indexed xUserId,
        address indexed asset,
        uint256 gross,
        uint256 fee,
        uint256 net,
        uint256 batchIndex,
        uint64 creditedAt
    );
    event Claimed(
        address indexed token,
        uint64 indexed xUserId,
        address indexed to,
        address asset,
        uint256 amount,
        uint256 nonce
    );
    event Exited(
        address indexed token, uint64 indexed xUserId, ExitRole role, address newRecipient, address caller
    );
    event Expired(
        address indexed token, address indexed creator, address indexed asset, uint256 amount, uint256 batches
    );
    event FeesWithdrawn(address indexed asset, address indexed recipient, uint256 amount);
    event AttesterQueued(address indexed newAttester, uint256 eta);
    event AttesterCancelled(address indexed cancelled);
    event AttesterUpdated(address indexed previousAttester, address indexed newAttester);
    event RegistrationPaused(bool paused);

    // ------------------------------------------------------------------ errors
    error ZeroAddress();
    error OnlyAdmin();
    error OnlySelf();
    error OnlySink();
    error RegistrationIsPaused();
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyExited();
    error NotPonsToken();
    error InvalidXUserId();
    error SignatureExpired();
    error InvalidCreatorSignature();
    error NotCurrentRecipient();
    error InvalidAttestation();
    error AttestationExpired();
    error NonceUsed();
    error NothingToClaim();
    error NothingExpired();
    error NothingToWithdraw();
    error NotCreator();
    error InvalidRecipient();
    error NoPendingAttester();
    error TimelockNotElapsed(uint256 eta);
    error EthTransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != ADMIN) revert OnlyAdmin();
        _;
    }

    constructor(
        address factory,
        address escrow,
        address feeRecipient,
        address admin,
        address initialAttester,
        uint256 attesterTimelock
    ) EIP712("FeeFlow", "1") {
        if (
            factory == address(0) || escrow == address(0) || feeRecipient == address(0) || admin == address(0)
                || initialAttester == address(0)
        ) revert ZeroAddress();
        FACTORY = IPonsFactory(factory);
        ESCROW = escrow;
        FEE_RECIPIENT = feeRecipient;
        ADMIN = admin;
        ATTESTER_TIMELOCK = attesterTimelock;
        attester = initialAttester;
        SINK_IMPLEMENTATION = address(new FeeSink());
    }

    /// @notice Accepts ETH only from fee sinks forwarding collected fees.
    receive() external payable {
        if (tokenOfSink[msg.sender] == address(0)) revert OnlySink();
    }

    // ================================================================== registration

    /// @notice Binds a Pons v2 token to an X account and deploys its fee sink.
    /// @param p.creator Must be the token's current Pons creator fee recipient, or its deployer when
    ///        the token was launched with the predicted sink as recipient. Recorded as the token's
    ///        creator: receives expired batches and may exit.
    /// @param creatorSig EIP-712 `Route{token, xUserId, deadline}` signed by `p.creator` (EOA or 1271).
    /// @param attestation EIP-712 `Register{token, xUserId, nonce, expiry}` from the attester,
    ///        attesting only that `xUserId` exists (not ownership).
    function registerToken(RegisterParams calldata p, bytes calldata creatorSig, bytes calldata attestation)
        external
        nonReentrant
        returns (address sink)
    {
        if (registrationPaused) revert RegistrationIsPaused();
        if (p.xUserId == 0) revert InvalidXUserId();
        if (p.creator == address(0)) revert ZeroAddress();
        if (_tokens[p.token].sink != address(0)) revert AlreadyRegistered();

        LaunchedToken memory lt = FACTORY.getLaunchedToken(p.token);
        if (!lt.exists) revert NotPonsToken();

        if (block.timestamp > p.creatorDeadline) revert SignatureExpired();
        bytes32 routeDigest =
            _hashTypedDataV4(keccak256(abi.encode(ROUTE_TYPEHASH, p.token, p.xUserId, p.creatorDeadline)));
        if (!SignatureChecker.isValidSignatureNow(p.creator, routeDigest, creatorSig)) {
            revert InvalidCreatorSignature();
        }

        bool isRecipient = lt.creatorFeeRecipient == p.creator;
        bool launchedToSink = lt.creatorFeeRecipient == predictSink(p.token) && lt.deployer == p.creator;
        if (!isRecipient && !launchedToSink) revert NotCurrentRecipient();

        _useAttestation(
            keccak256(abi.encode(REGISTER_TYPEHASH, p.token, p.xUserId, p.nonce, p.expiry)),
            p.nonce,
            p.expiry,
            attestation
        );

        sink = Clones.cloneDeterministic(SINK_IMPLEMENTATION, _salt(p.token));
        _tokens[p.token] = TokenInfo({
            sink: sink,
            xUserId: p.xUserId,
            routedAt: uint64(block.timestamp),
            exited: false,
            creator: p.creator,
            asset: lt.pairToken
        });
        tokenOfSink[sink] = p.token;
        FeeSink(payable(sink)).initialize(address(this), p.token, lt.pairToken, ESCROW, address(FACTORY));

        emit TokenRegistered(p.token, p.xUserId, p.creator, sink, lt.pairToken);
    }

    // ================================================================== collection

    /// @notice Pulls the token's escrow balance through its sink. Anyone can call.
    function collect(address token) external nonReentrant returns (uint256 net) {
        net = _collect(token);
    }

    /// @notice Collects several tokens. Reverts if any collection reverts; callers that need
    ///         isolation should fall back to `collect` per token.
    function collectMany(address[] calldata tokenList) external nonReentrant {
        for (uint256 i; i < tokenList.length; ++i) {
            _collect(tokenList[i]);
        }
    }

    /// @dev Used by exits via try/catch so a frozen asset can never block an exit.
    function collectFromSelf(address token) external {
        if (msg.sender != address(this)) revert OnlySelf();
        _collect(token);
    }

    function _collect(address token) internal returns (uint256 net) {
        TokenInfo storage t = _tokens[token];
        if (t.sink == address(0)) revert NotRegistered();
        address asset = t.asset;

        uint256 before = _balanceOf(asset);
        // The sink's return value is not trusted; FeeFlow measures its own balance delta.
        // slither-disable-next-line unused-return
        FeeSink(payable(t.sink)).pull();
        uint256 gross = _balanceOf(asset) - before;
        // slither-disable-next-line incorrect-equality
        if (gross == 0) return 0;

        uint256 fee = (gross * FEE_BPS) / BPS_DENOMINATOR;
        net = gross - fee;

        Totals storage tot = _totals[asset];
        tot.collectedGross += gross;
        tot.feesTaken += fee;
        accruedFees[asset] += fee;

        uint256 index = 0;
        if (net > 0) {
            tot.credited += net;
            credited[token] += net;
            uint256 tail = batchTail[token];
            // Same-timestamp collections share one batch, keeping the queue short.
            // slither-disable-next-line incorrect-equality
            if (tail > batchHead[token] && _batches[token][tail - 1].creditedAt == block.timestamp) {
                index = tail - 1;
                _batches[token][index].amount += SafeCast.toUint128(net);
            } else {
                index = tail;
                _batches[token][tail] =
                    Batch({amount: SafeCast.toUint128(net), creditedAt: uint64(block.timestamp)});
                batchTail[token] = tail + 1;
            }
        }
        emit Collected(token, t.xUserId, asset, gross, fee, net, index, uint64(block.timestamp));
    }

    // ================================================================== claims

    /// @notice Pays every credited batch of the listed tokens bound to `xUserId` to `to`.
    ///         Tokens not bound to `xUserId` are skipped. Nothing is taken at claim.
    /// @param attestation EIP-712 `Claim{xUserId, to, nonce, expiry}` from the attester.
    function claim(
        uint64 xUserId,
        address[] calldata tokenList,
        address to,
        uint256 expiry,
        uint256 nonce,
        bytes calldata attestation
    ) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _useAttestation(
            keccak256(abi.encode(CLAIM_TYPEHASH, xUserId, to, nonce, expiry)), nonce, expiry, attestation
        );

        (address[] memory assets, uint256[] memory amounts) = _debitClaim(xUserId, tokenList, to, nonce);
        uint256 n = amounts.length;

        // Interactions: one transfer per distinct asset.
        for (uint256 i; i < n; ++i) {
            uint256 amount = amounts[i];
            if (amount == 0) continue;
            for (uint256 j = i + 1; j < n; ++j) {
                if (amounts[j] != 0 && assets[j] == assets[i]) {
                    amount += amounts[j];
                    amounts[j] = 0;
                }
            }
            _pay(assets[i], to, amount);
        }
    }

    /// @dev Effects half of `claim`: zeroes credit for every listed token bound to `xUserId`.
    function _debitClaim(uint64 xUserId, address[] calldata tokenList, address to, uint256 nonce)
        internal
        returns (address[] memory assets, uint256[] memory amounts)
    {
        uint256 n = tokenList.length;
        assets = new address[](n);
        amounts = new uint256[](n);
        bool any = false;
        for (uint256 i; i < n; ++i) {
            address token = tokenList[i];
            TokenInfo storage t = _tokens[token];
            if (t.sink == address(0) || t.xUserId != xUserId) continue;
            uint256 amount = credited[token];
            if (amount == 0) continue;
            credited[token] = 0;
            batchHead[token] = batchTail[token];
            address asset = t.asset;
            _totals[asset].claimed += amount;
            assets[i] = asset;
            amounts[i] = amount;
            any = true;
            emit Claimed(token, xUserId, to, asset, amount, nonce);
        }
        if (!any) revert NothingToClaim();
    }

    // ================================================================== expiry

    /// @notice Releases up to `maxBatches` batches older than the claim window to the token's
    ///         registering creator. Never pays FeeFlow. Anyone can call.
    function releaseExpired(address token, uint256 maxBatches)
        external
        nonReentrant
        returns (uint256 amount)
    {
        TokenInfo storage t = _tokens[token];
        if (t.sink == address(0)) revert NotRegistered();
        uint256 h = batchHead[token];
        uint256 tail = batchTail[token];
        uint256 count;
        while (h < tail && count < maxBatches) {
            Batch storage b = _batches[token][h];
            if (uint256(b.creditedAt) + CLAIM_WINDOW > block.timestamp) break;
            amount += b.amount;
            delete _batches[token][h];
            ++h;
            ++count;
        }
        if (amount == 0) revert NothingExpired();
        batchHead[token] = h;
        credited[token] -= amount;
        _totals[t.asset].expiredToCreators += amount;
        emit Expired(token, t.creator, t.asset, amount, count);
        _pay(t.asset, t.creator, amount);
    }

    // ================================================================== exits

    /// @notice X account owner moves the token's future fees out of FeeFlow.
    /// @param attestation EIP-712 `Exit{xUserId, token, newRecipient, nonce, expiry}`; `xUserId` is
    ///        read from storage, so the attestation must be for the account bound to the token.
    function exitByHandle(
        address token,
        address newRecipient,
        uint256 expiry,
        uint256 nonce,
        bytes calldata attestation
    ) external nonReentrant {
        TokenInfo storage t = _activeToken(token);
        _useAttestation(
            keccak256(abi.encode(EXIT_TYPEHASH, t.xUserId, token, newRecipient, nonce, expiry)),
            nonce,
            expiry,
            attestation
        );
        _exit(token, t, newRecipient, ExitRole.Handle);
    }

    /// @notice Registering creator moves the token's future fees out of FeeFlow.
    function exitByCreator(address token, address newRecipient) external nonReentrant {
        TokenInfo storage t = _activeToken(token);
        if (msg.sender != t.creator) revert NotCreator();
        _exit(token, t, newRecipient, ExitRole.Creator);
    }

    function _exit(address token, TokenInfo storage t, address newRecipient, ExitRole role) internal {
        if (newRecipient == address(0) || newRecipient == t.sink) revert InvalidRecipient();
        t.exited = true;
        // Credit whatever is already in the escrow first; a revert (e.g. paused USDG) is ignored.
        try this.collectFromSelf(token) {} catch {}
        // If the sink never became the Pons recipient there is nothing to move.
        if (FACTORY.getLaunchedToken(token).creatorFeeRecipient == t.sink) {
            FeeSink(payable(t.sink)).transferRecipient(newRecipient);
        }
        emit Exited(token, t.xUserId, role, newRecipient, msg.sender);
    }

    // ================================================================== protocol fee

    /// @notice Sends accrued FeeFlow fees for `asset` to the immutable fee recipient. Anyone can call.
    function withdrawFees(address asset) external nonReentrant returns (uint256 amount) {
        amount = accruedFees[asset];
        if (amount == 0) revert NothingToWithdraw();
        accruedFees[asset] = 0;
        _totals[asset].feesWithdrawn += amount;
        emit FeesWithdrawn(asset, FEE_RECIPIENT, amount);
        _pay(asset, FEE_RECIPIENT, amount);
    }

    // ================================================================== admin (no balance powers)

    function queueAttester(address newAttester) external onlyAdmin {
        if (newAttester == address(0)) revert ZeroAddress();
        pendingAttester = newAttester;
        pendingAttesterEta = block.timestamp + ATTESTER_TIMELOCK;
        emit AttesterQueued(newAttester, pendingAttesterEta);
    }

    function cancelAttester() external onlyAdmin {
        address cancelled = pendingAttester;
        if (cancelled == address(0)) revert NoPendingAttester();
        pendingAttester = address(0);
        pendingAttesterEta = 0;
        emit AttesterCancelled(cancelled);
    }

    function executeAttester() external onlyAdmin {
        address next = pendingAttester;
        if (next == address(0)) revert NoPendingAttester();
        if (block.timestamp < pendingAttesterEta) revert TimelockNotElapsed(pendingAttesterEta);
        emit AttesterUpdated(attester, next);
        attester = next;
        pendingAttester = address(0);
        pendingAttesterEta = 0;
    }

    function setRegistrationPaused(bool paused) external onlyAdmin {
        registrationPaused = paused;
        emit RegistrationPaused(paused);
    }

    // ================================================================== views

    function tokens(address token) external view returns (TokenInfo memory) {
        return _tokens[token];
    }

    function totals(address asset) external view returns (Totals memory) {
        return _totals[asset];
    }

    function predictSink(address token) public view returns (address) {
        return Clones.predictDeterministicAddress(SINK_IMPLEMENTATION, _salt(token), address(this));
    }

    /// @notice Sum of credited batches already past the claim window (still claimable until released).
    function expirable(address token) external view returns (uint256 amount) {
        uint256 tail = batchTail[token];
        for (uint256 h = batchHead[token]; h < tail; ++h) {
            Batch storage b = _batches[token][h];
            if (uint256(b.creditedAt) + CLAIM_WINDOW > block.timestamp) break;
            amount += b.amount;
        }
    }

    /// @notice Claim deadline of the oldest outstanding batch, or 0 if none.
    function oldestDeadline(address token) external view returns (uint256) {
        uint256 h = batchHead[token];
        if (h >= batchTail[token]) return 0;
        return uint256(_batches[token][h].creditedAt) + CLAIM_WINDOW;
    }

    /// @notice Outstanding batches, oldest first, paginated.
    function batches(address token, uint256 offset, uint256 limit)
        external
        view
        returns (Batch[] memory out)
    {
        uint256 start = batchHead[token] + offset;
        uint256 tail = batchTail[token];
        if (start >= tail) return new Batch[](0);
        uint256 n = tail - start;
        if (n > limit) n = limit;
        out = new Batch[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = _batches[token][start + i];
        }
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ================================================================== internals

    function _activeToken(address token) internal view returns (TokenInfo storage t) {
        t = _tokens[token];
        if (t.sink == address(0)) revert NotRegistered();
        if (t.exited) revert AlreadyExited();
    }

    function _useAttestation(bytes32 structHash, uint256 nonce, uint256 expiry, bytes calldata signature)
        internal
    {
        if (block.timestamp > expiry) revert AttestationExpired();
        if (nonceUsed[nonce]) revert NonceUsed();
        // slither-disable-next-line unused-return
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(structHash), signature);
        if (err != ECDSA.RecoverError.NoError || signer != attester) revert InvalidAttestation();
        nonceUsed[nonce] = true;
    }

    function _salt(address token) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(token)));
    }

    function _balanceOf(address asset) internal view returns (uint256) {
        return asset == NATIVE ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }

    function _pay(address asset, address to, uint256 amount) internal {
        if (asset == NATIVE) {
            // `to` is attester-bound (claim), the stored creator (release) or the immutable fee
            // recipient (withdraw); never caller-chosen without a signature.
            // slither-disable-next-line arbitrary-send-eth
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }
}
