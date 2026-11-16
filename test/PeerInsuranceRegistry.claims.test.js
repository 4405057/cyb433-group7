const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployFixture() {
  const [admin, holder, a1, a2, other] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("PeerInsuranceRegistry");
  const registry = await Registry.deploy();
  await registry.grantRole(1, a1.address);
  await registry.grantRole(1, a2.address);
  const coverage = ethers.parseEther("1");
  const premium = (coverage * 500n) / 10000n;
  const terms = ethers.keccak256(ethers.toUtf8Bytes("terms-1"));
  await registry.connect(holder).buyPolicy(terms, coverage, 30 * 24 * 3600, { value: premium });
  return { registry, admin, holder, a1, a2, other, coverage, premium };
}

describe("claims and rules", function () {
  it("Test 6: holder files a claim after 7 days", async function () {
    const { registry, holder, coverage } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await expect(registry.connect(holder).fileClaim(1, ev, coverage))
      .to.emit(registry, "ClaimFiled")
      .withArgs(1, 1, holder.address, coverage, ev);
  });

  it("Test 7: R3 rejects claim before the waiting period", async function () {
    const { registry, holder, coverage } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await expect(registry.connect(holder).fileClaim(1, ev, coverage))
      .to.be.revertedWithCustomError(registry, "ClaimTooEarly");
  });

  it("Test 8: R3 rejects claim after policy end", async function () {
    const { registry, holder, coverage } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(30 * 24 * 3600 + 1);
    await expect(registry.connect(holder).fileClaim(1, ev, coverage))
      .to.be.revertedWithCustomError(registry, "ClaimWindowClosed");
  });

  it("Test 9: R1 rejects second claim on the same policy", async function () {
    const { registry, holder, coverage } = await loadFixture(deployFixture);
    const ev1 = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    const ev2 = ethers.keccak256(ethers.toUtf8Bytes("evidence-2"));
    await time.increase(7 * 24 * 3600 + 1);
    await registry.connect(holder).fileClaim(1, ev1, coverage);
    await expect(registry.connect(holder).fileClaim(1, ev2, coverage))
      .to.be.revertedWithCustomError(registry, "ClaimAlreadyFiled")
      .withArgs(1);
  });

  it("Test 10: R2 rejects same evidence hash on another policy", async function () {
    const { registry, holder, other, coverage, premium } = await loadFixture(deployFixture);
    const terms2 = ethers.keccak256(ethers.toUtf8Bytes("terms-2"));
    await registry.connect(other).buyPolicy(terms2, coverage, 30 * 24 * 3600, { value: premium });
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await registry.connect(holder).fileClaim(1, ev, coverage);
    await expect(registry.connect(other).fileClaim(2, ev, coverage))
      .to.be.revertedWithCustomError(registry, "EvidenceAlreadyUsed");
  });

  it("Test 11: R4 rejects amount above coverage", async function () {
    const { registry, holder, coverage } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await expect(registry.connect(holder).fileClaim(1, ev, coverage + 1n))
      .to.be.revertedWithCustomError(registry, "AmountExceedsCoverage");
  });

  it("Test 12: R5 first approval keeps Filed and second different assessor approves", async function () {
    const { registry, holder, a1, a2, coverage, premium } = await loadFixture(deployFixture);
    const amount = premium;
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await registry.connect(holder).fileClaim(1, ev, amount);

    await expect(registry.connect(a1).approveClaim(1))
      .to.emit(registry, "ClaimApprovalAdded")
      .withArgs(1, a1.address, 1);
    let claim = await registry.getClaim(1);
    expect(claim.approvals).to.equal(1n);
    expect(claim.status).to.equal(1n);

    await expect(registry.connect(a2).approveClaim(1))
      .to.emit(registry, "ClaimApproved")
      .withArgs(1, amount);
    claim = await registry.getClaim(1);
    expect(claim.approvals).to.equal(2n);
    expect(claim.status).to.equal(2n);
  });

  it("Test 13: R5 rejects same assessor approving twice", async function () {
    const { registry, holder, a1, premium } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await registry.connect(holder).fileClaim(1, ev, premium);
    await registry.connect(a1).approveClaim(1);
    await expect(registry.connect(a1).approveClaim(1))
      .to.be.revertedWithCustomError(registry, "AlreadyApproved");
  });

  it("Test 14: R5 rejects claimant who is also an assessor approving own claim", async function () {
    const { registry, holder, premium } = await loadFixture(deployFixture);
    await registry.grantRole(1, holder.address);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await registry.connect(holder).fileClaim(1, ev, premium);
    await expect(registry.connect(holder).approveClaim(1))
      .to.be.revertedWithCustomError(registry, "SelfReviewNotAllowed");
  });

  it("Test 15: non-holder cannot file a claim", async function () {
    const { registry, other, coverage } = await loadFixture(deployFixture);
    const ev = ethers.keccak256(ethers.toUtf8Bytes("evidence-1"));
    await time.increase(7 * 24 * 3600 + 1);
    await expect(registry.connect(other).fileClaim(1, ev, coverage))
      .to.be.revertedWithCustomError(registry, "NotPolicyHolder");
  });
});