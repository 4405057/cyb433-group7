const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

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
  return { registry, admin, holder, a1, a2, other, coverage };
}

describe("access control", function () {
  it("admin grants Underwriter", async function () {
    const { registry, other } = await loadFixture(deployFixture);
    await expect(registry.grantRole(0, other.address))
      .to.emit(registry, "RoleGranted")
      .withArgs(0, other.address);
    expect(await registry.isUnderwriter(other.address)).to.equal(true);
  });

  it("non-admin cannot grant a role", async function () {
    const { registry, other } = await loadFixture(deployFixture);
    await expect(registry.connect(other).grantRole(0, other.address))
      .to.be.revertedWithCustomError(registry, "NotAdmin");
  });

  it("revoked assessor cannot approve", async function () {
    const { registry, a1 } = await loadFixture(deployFixture);
    await registry.revokeRole(1, a1.address);
    expect(await registry.isAssessor(a1.address)).to.equal(false);
    await expect(registry.connect(a1).approveClaim(1))
      .to.be.revertedWithCustomError(registry, "NotAssessor");
  });

  it("two-step admin change works", async function () {
    const { registry, admin, other } = await loadFixture(deployFixture);
    await expect(registry.proposeAdmin(other.address))
      .to.emit(registry, "AdminProposed")
      .withArgs(other.address);
    await expect(registry.connect(other).acceptAdmin())
      .to.emit(registry, "AdminChanged")
      .withArgs(admin.address, other.address);
    expect(await registry.admin()).to.equal(other.address);
    expect(await registry.pendingAdmin()).to.equal(ethers.ZeroAddress);
  });

  it("acceptAdmin by the wrong account is rejected", async function () {
    const { registry, holder, other } = await loadFixture(deployFixture);
    await registry.proposeAdmin(other.address);
    await expect(registry.connect(holder).acceptAdmin())
      .to.be.revertedWithCustomError(registry, "NotPendingAdmin");
  });
});