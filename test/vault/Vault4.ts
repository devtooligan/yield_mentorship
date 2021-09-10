import hre, { network } from "hardhat";
import { BigNumber } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { Dai, Vault4, MockPriceFeedAggregator } from "../../typechain";

const { deployContract } = hre.waffle;
const { parseEther } = hre.ethers.utils;

const WAD = BigNumber.from("1" + "0".repeat(18));

const rateInvertWad = (ethRate: number) => {
  const daiEthRate: number = Math.round(1e18 / ethRate);
  return BigNumber.from(daiEthRate);
};

describe("Vault4 Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]

  const initialEthDaiExchangeRate = 3955.0;
  const initialDaiEthExchangeRateWad = rateInvertWad(initialEthDaiExchangeRate);

  const vaultStartingDai = WAD.mul(200000);
  const user1StartingEth = parseEther("10");
  const user2StartingEth = parseEther("5");

  const depositEth1 = parseEther("1.5");
  const depositEth2 = parseEther("3");
  const borrowDai1 = depositEth1.div(initialDaiEthExchangeRateWad).mul(WAD);
  const borrowDai2 = depositEth2.div(initialDaiEthExchangeRateWad).div(2).mul(WAD);

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers = {
      admin: signers[0],
      user1: signers[1],
      user2: signers[2],
    } as Signers;
    user1 = this.signers.user1;
    user2 = this.signers.user2;
  });

  beforeEach(async function () {
    this.dai = <Dai>await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Dai"), [1]);
    this.mockPriceFeedAggregator = <MockPriceFeedAggregator>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("MockPriceFeedAggregator"), [
        initialDaiEthExchangeRateWad,
      ])
    );
    this.vault = <Vault4>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Vault4"), [
        this.dai.address,
        this.mockPriceFeedAggregator.address,
      ])
    );
    // Fund the vault with some dai
    await this.dai.mint(this.vault.address, vaultStartingDai);

    // Fund 2 users with some eth
    await network.provider.send("hardhat_setBalance", [user1.address, user1StartingEth.toHexString()]);
    await network.provider.send("hardhat_setBalance", [user2.address, user2StartingEth.toHexString()]);
  });
  describe("without deposits or loans", function () {
    it("#withdraw() should not be able to withdraw without a deposit", async function () {
      await expect(this.vault.connect(user1).withdraw(parseEther("1"))).to.be.revertedWith("Insufficient balance");
    });

    it("#borrow() should not be able to borrow without a deposit", async function () {
      await expect(this.vault.connect(user1).borrow(WAD.mul(1000))).to.be.revertedWith("Insufficient collateral");
    });

    it("#deposit() should allow deposits from one or more users", async function () {
      await expect(this.vault.connect(user1).deposit({ value: depositEth1 }))
        .to.emit(this.vault, "Deposit")
        .withArgs(depositEth1);
      expect(await this.vault.deposits(user1.address)).to.be.equal(depositEth1);
      await this.vault.connect(user2).deposit({ value: depositEth2 });
      expect(await this.vault.deposits(user2.address)).to.be.equal(depositEth2);
    });
  });

  describe("with deposits", function () {
    beforeEach(async function () {
      await this.vault.connect(user1).deposit({ value: depositEth1 });
      await this.vault.connect(user2).deposit({ value: depositEth2 });
    });

    it("#withdraw() should not be able to withdraw more than the deposit", async function () {
      await expect(this.vault.connect(user1).withdraw(depositEth1.add(parseEther("0.5")))).to.be.revertedWith(
        "Insufficient balance",
      );
    });

    it("#borrow() should not be able to borrow more than the deposit", async function () {
      const borrow = depositEth1.add(parseEther("0.5")).mul(initialEthDaiExchangeRate).mul(WAD);
      await expect(this.vault.connect(user1).borrow(borrow)).to.be.revertedWith("Insufficient collateral");
    });

    it("#deposit() should allow additional deposits", async function () {
      await this.vault.connect(user1).deposit({ value: depositEth2 });
      expect(await this.vault.deposits(user1.address)).to.be.equal(depositEth1.add(depositEth2));
    });

    it("#withdraw() should be able to withdraw up to the deposited amount", async function () {
      // User1 withdraws entire deposit
      await expect(this.vault.connect(user1).withdraw(depositEth1))
        .to.emit(this.vault, "Withdraw")
        .withArgs(depositEth1);
      expect(await this.vault.deposits(user1.address)).to.be.equal(0);
      // User2 withdraws leaving 0.5 eth in the account
      await this.vault.connect(user2).withdraw(depositEth2.sub(parseEther("0.5")));
      expect(await this.vault.deposits(user2.address)).to.be.equal(parseEther("0.5"));
    });

    it("#borrow() should be able to borrow up to the deposited amount at current exchange rate", async function () {
      // User1 borrows entire deposit
      await expect(this.vault.connect(user1).borrow(borrowDai1)).to.emit(this.vault, "Borrow").withArgs(borrowDai1);
      expect(await this.vault.deposits(user1.address)).to.be.equal(depositEth1);
      expect(await this.vault.loans(user1.address)).to.be.equal(borrowDai1);
      expect(await this.dai.balanceOf(user1.address)).to.be.equal(borrowDai1);

      // // User2 borrows half of deposit worth
      await this.vault.connect(user2).borrow(borrowDai2);
      expect(await this.vault.deposits(user2.address)).to.be.equal(depositEth2);
      expect(await this.vault.loans(user2.address)).to.be.equal(borrowDai2);
      expect(await this.dai.balanceOf(user2.address)).to.be.equal(borrowDai2);
    });

    describe("with loans", function () {
      beforeEach(async function () {
        // User1 borrows entire deposit
        await this.vault.connect(user1).borrow(borrowDai1);
        // User2 borrows half of deposit worth
        await this.vault.connect(user2).borrow(borrowDai2);
      });

      it("#withdraw() should not be able to withdraw deposits being used as collateral", async function () {
        await expect(this.vault.connect(user1).withdraw(depositEth1)).to.be.revertedWith("Insufficient balance");
      });

      it("#borrow() should not be able to borrow beyond available collateral", async function () {
        await expect(this.vault.connect(user1).borrow(WAD.mul(1000))).to.be.revertedWith("Insufficient collateral");
        await expect(this.vault.connect(user2).borrow(borrowDai2)).to.not.be.reverted;
        await expect(this.vault.connect(user1).borrow(WAD.mul(1000))).to.be.revertedWith("Insufficient collateral");
        await this.vault.connect(user1).deposit({ value: parseEther("1") });
        await expect(this.vault.connect(user2).borrow(WAD.mul(1000))).to.be.revertedWith("Insufficient collateral");
      });

      it("#liquidate() should not be able to liquidate safe loans", async function () {
        await expect(this.vault.connect(this.signers.admin).liquidate(user1.address)).to.be.revertedWith("Loan safe");
        await expect(this.vault.connect(this.signers.admin).liquidate(user2.address)).to.be.revertedWith("Loan safe");
      });

      it("#repay() should not be able to repay more than the borrowed amount", async function () {
        await this.dai.connect(this.signers.user1).approve(this.vault.address, borrowDai1.mul(2));
        await expect(this.vault.connect(user1).repay(borrowDai1.mul(2))).to.be.revertedWith("Invalid amount");
      });

      it("#repay() should be able to repay up to the borrowed amount", async function () {
        await this.dai.connect(this.signers.user1).approve(this.vault.address, borrowDai1);
        await expect(this.vault.connect(user1).repay(borrowDai1)).to.emit(this.vault, "Repay").withArgs(borrowDai1);
        expect(await this.vault.deposits(user1.address)).to.be.equal(depositEth1);
        expect(await this.vault.loans(user1.address)).to.be.equal(0);

        const repayDai = borrowDai1.div(2);
        await this.dai.connect(this.signers.user2).approve(this.vault.address, repayDai);
        await this.vault.connect(user2).repay(repayDai);
        expect(await this.vault.deposits(user2.address)).to.be.equal(depositEth2);
        expect(await this.vault.loans(user2.address)).to.be.equal(repayDai);
      });

      it("#liquidate() should be able to liquidate underwater loans", async function () {
        await this.mockPriceFeedAggregator.setRate(rateInvertWad(500));
        await expect(this.vault.connect(this.signers.admin).liquidate(user1.address))
          .to.emit(this.vault, "Liquidate")
          .withArgs(user1.address, borrowDai1, depositEth1);
        await expect(this.vault.connect(this.signers.admin).liquidate(user2.address))
          .to.emit(this.vault, "Liquidate")
          .withArgs(user2.address, borrowDai2, depositEth2);
        expect(await this.vault.deposits(user1.address)).to.be.equal(0);
        expect(await this.vault.loans(user1.address)).to.be.equal(0);
        expect(await this.vault.deposits(user2.address)).to.be.equal(0);
        expect(await this.vault.loans(user2.address)).to.be.equal(0);
        expect(await hre.ethers.provider.getBalance(this.vault.address)).to.be.equal(depositEth1.add(depositEth2));
      });

      it("#withdraw() should be able to withdraw additional eth if ltv drops", async function () {
        await expect(this.vault.connect(user1).withdraw(parseEther("1"))).to.be.revertedWith("Insufficient balance");
        await this.mockPriceFeedAggregator.setRate(rateInvertWad(20000)); // Setting eth/dai rate to $20,000
        await expect(this.vault.connect(user1).withdraw(parseEther("1"))).to.be.not.be.reverted;
      });

      it("#borrow() should be able to borrow additional eth if ltv drops", async function () {
        await expect(this.vault.connect(user1).borrow(1000)).to.be.revertedWith("Insufficient collateral");
        await this.mockPriceFeedAggregator.setRate(rateInvertWad(20000)); // Setting eth/dai rate to $20,000
        await expect(this.vault.connect(user1).borrow(1000)).to.be.not.be.reverted;
      });
    });
  });
});
