const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("PeerInsuranceRegistry Smoke Tests", function () {
  async function deployFixture() {
    const [deployer, member] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PeerInsuranceRegistry");
    const registry = await Registry.deploy();
    return { registry, deployer, member };
  }

  it("Test 1: member buys a policy with the right premium and PolicyIssued appears", async function () {
    const { registry, member } = await loadFixture(deployFixture);
    const coverage = ethers.parseEther("1.0");
    const premium = (coverage * 500n) / 10000n;
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms-1"));

    await expect(
      registry.connect(member).buyPolicy(termsHash, coverage, 30 * 24 * 3600, { value: premium })
    )
      .to.emit(registry, "PolicyIssued")
      .withArgs(1n, member.address, coverage, (val) => val > 0n, termsHash);
  });

  it("Test 2: getPolicy returns the same holder, coverage and hash", async function () {
    const { registry, member } = await loadFixture(deployFixture);
    const coverage = ethers.parseEther("1.0");
    const premium = (coverage * 500n) / 10000n;
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms-1"));

    await registry.connect(member).buyPolicy(termsHash, coverage, 30 * 24 * 3600, { value: premium });
    const policy = await registry.getPolicy(1);

    expect(policy.holder).to.equal(member.address);
    expect(policy.coverage).to.equal(coverage);
    expect(policy.termsHash).to.equal(termsHash);
  });

  it("Test 3: underwriter cancels the policy and status becomes Cancelled", async function () {
    const { registry, deployer, member } = await loadFixture(deployFixture);
    const coverage = ethers.parseEther("1.0");
    const premium = (coverage * 500n) / 10000n;
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes("terms-1"));
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("fraud"));

    await registry.connect(member).buyPolicy(termsHash, coverage, 30 * 24 * 3600, { value: premium });
    await registry.connect(deployer).cancelPolicy(1, reasonHash);

    const policy = await registry.getPolicy(1);
    expect(policy.status).to.equal(2n); // 0=None, 1=Active, 2=Cancelled
  });
});
