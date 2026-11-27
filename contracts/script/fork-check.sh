#!/bin/sh
# Deploys FeeFlow on a local fork of Robinhood mainnet with the production values and reads them
# back. Run from contracts/ (e.g. in ghcr.io/foundry-rs/foundry: sh script/fork-check.sh).
set -e
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --auto-impersonate --silent &
sleep 6
R=http://127.0.0.1:8545
W=0x9F220f524b978C45b246fde763b460FE3fAfd1bf
A=0x00f76cb42B0A5433fa6F5291fFeBa73234291b43
export PONS_FACTORY_ADDRESS=0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e PONS_ESCROW_ADDRESS=0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e
export FEEFLOW_FEE_RECIPIENT=$W ADMIN_MULTISIG=$W ATTESTER_ADDRESS=$A ATTESTER_TIMELOCK=172800
forge script script/Deploy.s.sol --rpc-url $R --sender $W --unlocked --broadcast > /tmp/deploy.log 2>&1 || { tail -20 /tmp/deploy.log; exit 1; }
FF=$(grep -E "^\s+FeeFlow " /tmp/deploy.log | awk "{print \$2}")
echo "deployed on fork: $FF"
for g in "FACTORY()(address)" "ESCROW()(address)" "FEE_RECIPIENT()(address)" "ADMIN()(address)" "attester()(address)" "ATTESTER_TIMELOCK()(uint256)" "registrationPaused()(bool)" "FEE_BPS()(uint256)" "CLAIM_WINDOW()(uint256)"; do
  printf "  %-30s %s\n" "$g" "$(cast call $FF "$g" --rpc-url $R 2>&1 | head -1)"
done
cast rpc anvil_setBalance $A 0xde0b6b3a7640000 --rpc-url $R >/dev/null
B0=$(cast balance $W --rpc-url $R)
cast send $W --value 1000000000000000 --from $A --unlocked --rpc-url $R > /tmp/send.log 2>&1 && echo "  ETH to fee wallet: status $(grep -E "^status" /tmp/send.log | awk "{print \$2}"), balance +$(( $(cast balance $W --rpc-url $R) - B0 )) wei" || { echo "  ETH to fee wallet FAILED"; tail -5 /tmp/send.log; }
kill $! 2>/dev/null || true
