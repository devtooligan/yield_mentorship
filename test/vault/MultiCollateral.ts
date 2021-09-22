import hre from "hardhat";
import { BigNumber } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { Dai, MultiCollateralVault, TooliganToken, MockPriceFeedAggregator } from "../../typechain";

const { deployContract } = hre.waffle;
const { parseEther } = hre.ethers.utils;

const WAD = BigNumber.from("1" + "0".repeat(18));

const rateInvert = (tokenRate: number, decimals: number) => {
  return BigNumber.from(Math.round((1.0 / tokenRate) * 10.0 ** decimals).toString());
};

describe("MultiCollateralVault Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]

  const initialToolieDaiExchangeRate = 10.0;
  const initialUsdToolieExchangeRateInverted = rateInvert(initialToolieDaiExchangeRate, 20);

  const initialEthDaiExchangeRate = 4000.0;
  const initialDaiEthExchangeRateInverted = rateInvert(initialEthDaiExchangeRate, 8);

  const vaultStartingDai = WAD.mul(2000000);
  const user1StartingToolie = WAD.mul("100");
  const user2StartingToolie = WAD.mul("50");

  const user1StartingWeth = WAD.mul("5");
  const user2StartingWeth = WAD.mul("6");

  const depositWeth1 = WAD.div("2");
  const depositToolie2 = WAD.mul("2");
  const borrowDai1 = depositWeth1.mul(initialEthDaiExchangeRate);
  let borrowDai2: BigNumber;

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
    this.toolieToken = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );
    this.linkToken = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );

    this.wethToken = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );

    this.MockPriceFeedAggregatorDaiEth = <MockPriceFeedAggregator>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("MockPriceFeedAggregator"), [
        initialDaiEthExchangeRateInverted,
        8,
      ])
    );
    this.MockPriceFeedAggregatorUsdToolie = <MockPriceFeedAggregator>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("MockPriceFeedAggregator"), [
        initialUsdToolieExchangeRateInverted,
        20,
      ])
    );
    this.vault = <MultiCollateralVault>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("MultiCollateralVault"), [
        this.dai.address,
      ])
    );
    // Fund the vault with some dai
    await this.dai.mint(this.vault.address, vaultStartingDai);

    // Fund users with some eth
    await this.toolieToken.mint(user1.address, user1StartingToolie);
    await this.toolieToken.mint(user2.address, user2StartingToolie);

    await this.wethToken.mint(user1.address, user1StartingWeth);
    await this.wethToken.mint(user2.address, user2StartingWeth);

    this.vault
      .connect(this.signers.admin)
      .addAcceptedToken(this.toolieToken.address, this.MockPriceFeedAggregatorUsdToolie.address);
    this.vault
      .connect(this.signers.admin)
      .addAcceptedToken(this.wethToken.address, this.MockPriceFeedAggregatorDaiEth.address);
  });
  describe("without deposits or loans", function () {
    it("#withdraw() should not be able to withdraw without a deposit", async function () {
      await expect(this.vault.connect(user1).withdraw(this.wethToken.address, parseEther("1"))).to.be.revertedWith(
        "Insufficient balance",
      );
    });

    it("#borrow() should not be able to borrow without a deposit", async function () {
      await expect(this.vault.connect(user1).borrow(WAD.mul(1000))).to.be.revertedWith("Insufficient collateral");
    });

    it("#deposit() should allow deposits from one or more users from different tokens", async function () {
      await this.wethToken.connect(user1).approve(this.vault.address, depositWeth1);
      await expect(this.vault.connect(user1).deposit(this.wethToken.address, depositWeth1))
        .to.emit(this.vault, "Deposit")
        .withArgs(this.wethToken.address, depositWeth1);

      const deposits1 = await this.vault.deposits(user1.address, this.wethToken.address);
      expect(deposits1).to.be.equal(depositWeth1);
      await this.toolieToken.connect(user2).approve(this.vault.address, depositToolie2);
      await this.vault.connect(user2).deposit(this.toolieToken.address, depositToolie2);
      const deposits2 = await this.vault.deposits(user2.address, this.toolieToken.address);
      expect(deposits2).to.be.equal(depositToolie2);

      await this.wethToken.connect(user2).approve(this.vault.address, depositWeth1);
      await this.vault.connect(user2).deposit(this.wethToken.address, depositWeth1);
      const deposits3 = await this.vault.deposits(user2.address, this.wethToken.address);
      expect(deposits3).to.be.equal(depositWeth1);
    });
  });

  describe("with deposits", function () {
    beforeEach(async function () {
      await this.wethToken.connect(user1).approve(this.vault.address, depositWeth1);
      await this.vault.connect(user1).deposit(this.wethToken.address, depositWeth1);

      await this.toolieToken.connect(user2).approve(this.vault.address, depositToolie2);
      await this.vault.connect(user2).deposit(this.toolieToken.address, depositToolie2);

      await this.wethToken.connect(user2).approve(this.vault.address, depositWeth1);
      await this.vault.connect(user2).deposit(this.wethToken.address, depositWeth1);

      const wethDaiAmount = depositWeth1.mul(initialEthDaiExchangeRate);
      const toolieDaiAmount = depositToolie2.mul(initialToolieDaiExchangeRate);
      borrowDai2 = wethDaiAmount.add(toolieDaiAmount);
    });

    it("#withdraw() should not be able to withdraw more than the deposit", async function () {
      await expect(
        this.vault.connect(user1).withdraw(this.wethToken.address, depositWeth1.add(parseEther("0.5"))),
      ).to.be.revertedWith("Insufficient balance");
    });

    it("#borrow() should not be able to borrow more than the deposit", async function () {
      const borrow = depositWeth1.add(parseEther("0.5")).mul(initialToolieDaiExchangeRate).mul(WAD);
      await expect(this.vault.connect(user1).borrow(borrow)).to.be.revertedWith("Insufficient collateral");
    });

    it("#withdraw() should be able to withdraw up to the deposited amount", async function () {
      // User1 withdraws entire deposit
      await expect(this.vault.connect(user1).withdraw(this.wethToken.address, depositWeth1))
        .to.emit(this.vault, "Withdraw")
        .withArgs(this.wethToken.address, depositWeth1);
      expect(await this.vault.deposits(user1.address, this.wethToken.address)).to.be.equal(0);

      // User2 withdraws leaving 0.5 weth in the account
      await this.vault.connect(user2).withdraw(this.wethToken.address, depositWeth1.sub(parseEther("0.05")));
      expect(await this.vault.deposits(user2.address, this.wethToken.address)).to.be.equal(parseEther("0.05"));

      // User2 withdraws all toolies
      await this.vault.connect(user2).withdraw(this.toolieToken.address, depositToolie2);
      expect(await this.vault.deposits(user2.address, this.toolieToken.address)).to.be.equal(0);
    });

    it("#borrow() should be able to borrow up to the deposited amount at current exchange rate", async function () {
      // User1 borrows entire deposit
      await expect(this.vault.connect(user1).borrow(borrowDai1)).to.emit(this.vault, "Borrow").withArgs(borrowDai1);
      expect(await this.vault.deposits(user1.address, this.wethToken.address)).to.be.equal(depositWeth1);
      expect(await this.vault.loans(user1.address)).to.be.equal(borrowDai1);
      expect(await this.dai.balanceOf(user1.address)).to.be.equal(borrowDai1);

      // User2 borrows with 2 different types of collateral
      await this.vault.connect(user2).borrow(borrowDai2);
      expect(await this.vault.deposits(user2.address, this.wethToken.address)).to.be.equal(depositWeth1);
      expect(await this.vault.deposits(user2.address, this.toolieToken.address)).to.be.equal(depositToolie2);
      expect(await this.vault.loans(user2.address)).to.be.equal(borrowDai2);
      expect(await this.dai.balanceOf(user2.address)).to.be.equal(borrowDai2);
    });
    describe("with loans", function () {
      beforeEach(async function () {
        const wethDaiAmount = depositWeth1.mul(initialEthDaiExchangeRate);
        const toolieDaiAmount = depositToolie2.mul(initialToolieDaiExchangeRate);

        borrowDai2 = wethDaiAmount.add(toolieDaiAmount).sub(WAD); // Borrow everything except for 1

        // User1 borrows entire deposit
        await this.vault.connect(user1).borrow(borrowDai1);
        // User2 borrows with 2 different types of collateral leaving 1 eth in
        await this.vault.connect(user2).borrow(borrowDai2);
      });

      it("#withdraw() should not be able to withdraw deposits being used as collateral", async function () {
        await expect(this.vault.connect(user1).withdraw(this.wethToken.address, depositWeth1)).to.be.revertedWith(
          "Insufficient balance",
        );
      });

      it("#borrow() should not be able to borrow beyond available collateral", async function () {
        await expect(this.vault.connect(user1).borrow(WAD.mul(5000))).to.be.revertedWith("Insufficient collateral");
        await expect(this.vault.connect(user2).borrow(WAD)).to.not.be.reverted;
        await expect(this.vault.connect(user2).borrow(WAD.mul(2200))).to.be.revertedWith("Insufficient collateral");
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
        expect(await this.vault.deposits(user1.address, this.wethToken.address)).to.be.equal(depositWeth1);
        expect(await this.vault.loans(user1.address)).to.be.equal(0);
      });

      it("#liquidate() should be able to liquidate underwater loans", async function () {
        await this.MockPriceFeedAggregatorDaiEth.setRate(rateInvert(1, 8));
        await this.MockPriceFeedAggregatorUsdToolie.setRate(rateInvert(1, 20));
        await expect(this.vault.connect(this.signers.admin).liquidate(user1.address))
          .to.emit(this.vault, "Liquidate")
          .withArgs(user1.address, borrowDai1);
        await expect(this.vault.connect(this.signers.admin).liquidate(user2.address))
          .to.emit(this.vault, "Liquidate")
          .withArgs(user2.address, borrowDai2);
        expect(await this.vault.deposits(this.wethToken.address, user1.address)).to.be.equal(0);
        expect(await this.vault.loans(user1.address)).to.be.equal(0);
        expect(await this.vault.deposits(this.wethToken.address, user2.address)).to.be.equal(0);
        expect(await this.vault.deposits(this.toolieToken.address, user2.address)).to.be.equal(0);
        expect(await this.vault.loans(user2.address)).to.be.equal(0);
      });

      it("#borrow() should be able to borrow additional eth if ltv drops", async function () {
        await expect(this.vault.connect(user1).borrow(1000)).to.be.revertedWith("Insufficient collateral");
        await this.MockPriceFeedAggregatorDaiEth.setRate(rateInvert(20000, 8)); // Setting eth/dai rate to $20,000
        await expect(this.vault.connect(user1).borrow(1000)).to.be.not.be.reverted;
      });
    });
  });
});
