
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400;
const DURATION = 30 * DAY;
const COVERAGE = ethers.parseEther("1");
const PREMIUM = ethers.parseEther("0.05");
const AMOUNT = ethers.parseEther("0.04");
const hash = ethers.id;

async function setup() {
  const [admin, holder, a1, a2, other] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("PeerInsuranceRegistry");
  const registry = await Registry.deploy();
  await registry.grantRole(1, a1.address);
  await registry.grantRole(1, a2.address);
  await registry.connect(holder).buyPolicy(hash("terms"), COVERAGE, DURATION, { value: PREMIUM });
  return { registry, holder, a1, a2, other };
}

async function filed() {
  const x = await setup();
  await time.increase(7 * DAY + 1);
  await x.registry.connect(x.holder).fileClaim(1, hash("evidence"), AMOUNT);
  return x;
}

async function approved() {
  const x = await filed();
  await x.registry.connect(x.a1).approveClaim(1);
  await x.registry.connect(x.a2).approveClaim(1);
  return x;
}

async function attackSetup() {
  const x = await setup();
  const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
  const attacker = await Attacker.connect(x.holder).deploy(await x.registry.getAddress());
  await attacker.waitForDeployment();
  await attacker.connect(x.holder).buyPolicy(hash("attack-terms"), COVERAGE, DURATION, { value: PREMIUM });
  await time.increase(7 * DAY + 1);
  await attacker.connect(x.holder).fileClaim(hash("attack-evidence"), AMOUNT);
  await x.registry.connect(x.a1).approveClaim(1);
  await x.registry.connect(x.a2).approveClaim(1);
  return { ...x, attacker };
}

describe("P3 Payout and Security Tests", function () {
  it("rejects approval when the pool has insufficient funds", async function () {
    const { registry, holder, a1, a2 } = await loadFixture(setup);
    const amount = ethers.parseEther("0.06");

    await time.increase(7 * DAY + 1);
    await registry.connect(holder).fileClaim(1, hash("evidence"), amount);
    await registry.connect(a1).approveClaim(1);

    await expect(registry.connect(a2).approveClaim(1))
      .to.be.revertedWithCustomError(registry, "InsufficientPool");

    expect((await registry.getClaim(1)).approvals).to.equal(1n);
  });

  it("reserves funds and prevents overpayment", async function () {
    const { registry, holder, other, a1, a2 } = await loadFixture(setup);
    const first = ethers.parseEther("0.08");
    const second = ethers.parseEther("0.03");

    await registry.connect(other).buyPolicy(hash("terms2"), COVERAGE, DURATION, { value: PREMIUM });
    await time.increase(7 * DAY + 1);

    await registry.connect(holder).fileClaim(1, hash("ev1"), first);
    await registry.connect(other).fileClaim(2, hash("ev2"), second);

    await registry.connect(a1).approveClaim(1);
    await registry.connect(a2).approveClaim(1);
    await registry.connect(a1).approveClaim(2);

    await expect(registry.connect(a2).approveClaim(2))
      .to.be.revertedWithCustomError(registry, "InsufficientPool");

    expect(await registry.reserved()).to.equal(first);
  });

  it("rejects payouts for rejected claims", async function () {
    const { registry, holder, a1 } = await loadFixture(filed);

    await expect(registry.connect(a1).rejectClaim(1))
      .to.emit(registry, "ClaimRejected");

    await expect(registry.connect(holder).withdrawPayout(1))
      .to.be.revertedWithCustomError(registry, "InvalidClaimStatus");
  });

  it("pays the claimant only once and updates the pool", async function () {
    const { registry, holder, other } = await loadFixture(approved);

    await expect(registry.connect(other).withdrawPayout(1))
      .to.be.revertedWithCustomError(registry, "NotClaimant");

    await expect(registry.connect(holder).withdrawPayout(1))
      .to.changeEtherBalances([registry, holder], [-AMOUNT, AMOUNT]);

    expect((await registry.getClaim(1)).status).to.equal(4n);
    expect((await registry.getPolicy(1)).status).to.equal(4n);

    const stats = await registry.poolStats();
    expect(stats[0]).to.equal(PREMIUM - AMOUNT);
    expect(stats[1]).to.equal(0n);
    expect(stats[2]).to.equal(PREMIUM - AMOUNT);
    expect(stats[3]).to.equal(AMOUNT);

    await expect(registry.connect(holder).withdrawPayout(1))
      .to.be.revertedWithCustomError(registry, "InvalidClaimStatus");
  });

  it("blocks a reentrancy attack", async function () {
    const { registry, holder, attacker } = await loadFixture(attackSetup);

    await attacker.connect(holder).withdraw();

    expect(await attacker.attempted()).to.equal(true);
    expect(await attacker.reentered()).to.equal(false);
    expect((await registry.getClaim(1)).status).to.equal(4n);
    expect(await registry.totalPaid()).to.equal(AMOUNT);
  });

  it("reverts safely when an ETH transfer fails", async function () {
    const { registry, holder, attacker } = await loadFixture(attackSetup);

    await attacker.connect(holder).setRejectPayment(true);

    await expect(attacker.connect(holder).withdraw())
      .to.be.revertedWithCustomError(registry, "TransferFailed");

    expect((await registry.getClaim(1)).status).to.equal(2n);
    expect(await registry.reserved()).to.equal(AMOUNT);
  });
});
