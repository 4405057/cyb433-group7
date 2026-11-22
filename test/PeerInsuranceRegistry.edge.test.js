
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400;
const DURATION = 30 * DAY;
const COVERAGE = ethers.parseEther("1");
const PREMIUM = ethers.parseEther("0.05");
const hash = ethers.id;

async function setup() {
  const [admin, holder, other] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("PeerInsuranceRegistry");
  const registry = await Registry.deploy();
  await registry.connect(holder).buyPolicy(hash("terms"), COVERAGE, DURATION, { value: PREMIUM });
  return { registry, holder, other };
}

describe("P3 Edge Tests", function () {
  it("rejects invalid policy inputs", async function () {
    const { registry, other } = await loadFixture(setup);
    const buy = (h, c, d, value) => registry.connect(other).buyPolicy(h, c, d, { value });

    await expect(buy(hash("new"), COVERAGE, DURATION, 1n))
      .to.be.revertedWithCustomError(registry, "WrongPremium");
    await expect(buy(hash("new"), COVERAGE, 29 * DAY, PREMIUM))
      .to.be.revertedWithCustomError(registry, "InvalidDuration");
    await expect(buy(hash("new"), COVERAGE, 366 * DAY, PREMIUM))
      .to.be.revertedWithCustomError(registry, "InvalidDuration");
    await expect(buy(ethers.ZeroHash, COVERAGE, DURATION, PREMIUM))
      .to.be.revertedWithCustomError(registry, "ZeroHash");
    await expect(buy(hash("new"), 0, DURATION, 0))
      .to.be.revertedWithCustomError(registry, "InvalidAmount");
    await expect(buy(hash("tiny"), 1n, DURATION, 0n))
      .to.be.revertedWithCustomError(registry, "WrongPremium");
  });

  it("handles policy expiration correctly", async function () {
    const { registry } = await loadFixture(setup);

    await expect(registry.markExpired(1))
      .to.be.revertedWithCustomError(registry, "PolicyNotEnded");

    await time.increase(DURATION + 1);
    await expect(registry.markExpired(1))
      .to.emit(registry, "PolicyExpired");

    expect((await registry.getPolicy(1)).status).to.equal(3n);
  });

  it("rejects claims on cancelled policies", async function () {
    const { registry, holder } = await loadFixture(setup);

    await registry.cancelPolicy(1, hash("fraud"));
    await time.increase(7 * DAY + 1);

    await expect(registry.connect(holder).fileClaim(1, hash("evidence"), PREMIUM))
      .to.be.revertedWithCustomError(registry, "InvalidPolicyStatus");
  });

  it("rejects unauthorized operations", async function () {
    const { registry, holder, other } = await loadFixture(setup);

    await expect(registry.connect(other).cancelPolicy(1, hash("fraud")))
      .to.be.revertedWithCustomError(registry, "NotUnderwriter");

    await time.increase(7 * DAY + 1);
    await registry.connect(holder).fileClaim(1, hash("evidence"), PREMIUM);

    await expect(registry.connect(other).approveClaim(1))
      .to.be.revertedWithCustomError(registry, "NotAssessor");
  });
});
