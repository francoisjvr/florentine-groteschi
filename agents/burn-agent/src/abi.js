import { Interface } from "ethers";

export const BRAINROT_ABI = [
  "function agentBurnFromCollection(uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAdmin(address account) view returns (bool)",
  "function getAgentBurnedCount() view returns (uint256)"
];

export const BRAINROT_IFACE = new Interface(BRAINROT_ABI);
export const AGENT_BURN_SELECTOR = BRAINROT_IFACE.getFunction("agentBurnFromCollection").selector;

export function encodeAgentBurn(tokenId) {
  const parsed = BigInt(tokenId);
  if (parsed <= 0n) throw new Error("tokenId must be a positive integer");
  return BRAINROT_IFACE.encodeFunctionData("agentBurnFromCollection", [parsed]);
}
