const hre = require("hardhat");

const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS ||
  "0x8d61e5827e57840B33f53E2A9243A2827783B1C7";

const POLICY_STATUS = [
  "None",
  "Active",
  "Cancelled",
  "Expired",
  "Claimed",
];

const CLAIM_STATUS = [
  "None",
  "Filed",
  "Approved",
  "Rejected",
  "Paid",
];

async function main() {
  const [account] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  const network = await provider.getNetwork();
  const balance = await provider.getBalance(account.address);

  const registry = await hre.ethers.getContractAt(
    "PeerInsuranceRegistry",
    CONTRACT_ADDRESS
  );

  console.log("\n===== PeerInsuranceRegistry Interaction =====");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Connected account:", account.address);
  console.log("Wallet balance:", hre.ethers.formatEther(balance), "ETH");

  console.log("\n===== Contract Overview =====");

  const admin = await registry.admin();
  const policyCount = await registry.policyCount();
  const claimCount = await registry.claimCount();
  const stats = await registry.poolStats();

  console.log("Admin:", admin);
  console.log("Policies:", policyCount.toString());
  console.log("Claims:", claimCount.toString());

  console.log("\n===== Pool Statistics =====");
  console.log("Contract balance:", hre.ethers.formatEther(stats[0]), "ETH");
  console.log("Reserved:", hre.ethers.formatEther(stats[1]), "ETH");
  console.log("Available:", hre.ethers.formatEther(stats[2]), "ETH");
  console.log("Total paid:", hre.ethers.formatEther(stats[3]), "ETH");

  const policyId = process.env.POLICY_ID;

  if (policyId) {
    console.log("\n===== Policy Details =====");

    const policy = await registry.getPolicy(policyId);
    const isValid = await registry.verifyPolicy(policyId);

    console.log("Policy ID:", policyId);
    console.log("Holder:", policy.holder);
    console.log("Coverage:", hre.ethers.formatEther(policy.coverage), "ETH");
    console.log("Status:", POLICY_STATUS[Number(policy.status)]);
    console.log("Valid:", isValid);
    console.log("Start:", new Date(Number(policy.startTime) * 1000).toLocaleString());
    console.log("End:", new Date(Number(policy.endTime) * 1000).toLocaleString());
  }

 const claimId = process.env.CLAIM_ID;

if (
  claimId &&
  Number(claimId) <= Number(claimCount) &&
  Number(claimId) > 0
) {
  console.log("\n===== Claim Details =====");

  const claim = await registry.getClaim(claimId);

  console.log("Claim ID:", claimId);
  console.log("Policy ID:", claim.policyId.toString());
  console.log("Claimant:", claim.claimant);
  console.log("Amount:", hre.ethers.formatEther(claim.amount), "ETH");
  console.log("Approvals:", claim.approvals.toString());
  console.log("Status:", CLAIM_STATUS[Number(claim.status)]);
} else if (claimId) {
  console.log(
    `Claim ${claimId} does not exist. Current claim count: ${claimCount}`
  );
}

console.log("\nRead-only interaction completed.");
}

main().catch((error) => {
  console.error("Interaction failed:", error);
  process.exitCode = 1;
});
