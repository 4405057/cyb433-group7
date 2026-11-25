
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const Registry = await hre.ethers.getContractFactory(
    "PeerInsuranceRegistry"
  );

  const registry = await Registry.deploy();

  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();

  console.log("PeerInsuranceRegistry deployed to:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
