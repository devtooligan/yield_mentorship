import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { TooliganToken, Vault3 } from "../../typechain";

const { deployContract } = hre.waffle;

describe("Vault3 Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]
  const mintAmount: number = 10000; // user1 and user2 mint this many Toolies
  const initialExchangeRate: number = 1.1;
  const exchangeRate1: number = 0.5;
  const exchangeRate2: number = 4.0;
  const exchangeRateWad1: string = (exchangeRate1 * 10 ** 18).toString();
  const exchangeRateWad2: string = (exchangeRate2 * 10 ** 18).toString();

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
    this.toolieToken = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );
    await this.toolieToken.mint(user1.address, 10000);
    await this.toolieToken.mint(user2.address, 10000);
    const initialExchangeRateWad = (initialExchangeRate * 10 ** 18).toString();
    this.vault = <Vault3>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Vault3"), [
        this.toolieToken.address,
        initialExchangeRateWad,
      ])
    );
  });

  describe("without approval", function () {
    it("#setExchangeRate() should only allow owner to set rate", async function () {
      await expect(this.vault.connect(user1).setExchangeRate(exchangeRateWad1)).to.be.revertedWith("Unauthorized");
    });

    it("#deposit() should not be able to deposit without approving first", async function () {
      await expect(this.vault.connect(user1).deposit(1000)).to.be.revertedWith("ERC20: Insufficient approval");
    });

    it("#setExchangeRate() should allow owner to set rate", async function () {
      await expect(this.vault.connect(this.signers.admin).setExchangeRate(exchangeRateWad1))
        .to.emit(this.vault, "SetExchangeRate")
        .withArgs(exchangeRateWad1);
    });

    describe("with approved amounts", function () {
      beforeEach(async function () {
        await this.vault.connect(user1).approve(this.vault.address, 500);
        await this.toolieToken.connect(user1).approve(this.vault.address, 1000);
        await this.toolieToken.connect(user2).approve(this.vault.address, 5000);
      });

      it("#withdraw() should not be able to withdraw without holding vault tokens", async function () {
        await expect(this.vault.connect(user1).withdraw(500)).to.be.revertedWith("ERC20: Insufficient balance");
      });

      it("#deposit() should allow deposits from one or more users", async function () {
        await expect(this.vault.connect(user1).deposit(1000)).to.emit(this.vault, "Deposit").withArgs(1000);
        await this.vault.connect(user2).deposit(5000);

        expect(await this.vault.balanceOf(user1.address)).to.be.equal(1000 * initialExchangeRate);
        expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount - 1000);
        expect(await this.vault.balanceOf(user2.address)).to.be.equal(5000 * initialExchangeRate);
        expect(await this.toolieToken.balanceOf(user2.address)).to.be.equal(mintAmount - 5000);
      });

      it("#deposit() should handle deposits at varying exchange rates", async function () {
        await expect(this.vault.connect(user1).deposit(1000)).to.emit(this.vault, "Deposit").withArgs(1000);
        let currentVaultTokenBalance = 1000 * initialExchangeRate;
        let currentToolieTokenBalance = mintAmount - 1000;
        expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
        expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);

        await this.vault.connect(this.signers.admin).setExchangeRate(exchangeRateWad1);
        await this.toolieToken.connect(user1).approve(this.vault.address, 1000);
        await this.vault.connect(user1).deposit(1000);
        currentVaultTokenBalance += 1000 * exchangeRate1;
        currentToolieTokenBalance -= 1000;
        expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
        expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);

        await this.vault.connect(this.signers.admin).setExchangeRate(exchangeRateWad2);
        await this.toolieToken.connect(user1).approve(this.vault.address, 1000);
        await this.vault.connect(user1).deposit(1000);
        currentVaultTokenBalance += 1000 * exchangeRate2;
        currentToolieTokenBalance -= 1000;
        expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
        expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);
        expect(await this.vault.totalSupply()).to.be.equal(currentVaultTokenBalance);
      });
    });
  });

  describe("with a balance of vault tokens", function () {
    let currentVaultTokenBalance: number;
    let currentToolieTokenBalance: number;

    beforeEach(async function () {
      await this.toolieToken.connect(user1).approve(this.vault.address, 5000);
      await this.vault.connect(user1).deposit(5000);
      currentVaultTokenBalance = 5000 * initialExchangeRate;
      currentToolieTokenBalance = mintAmount - 5000;
    });

    it("#withdraw() should be able to withdraw less than the amount of vault tokens held at varying exchange rates", async function () {
      await this.vault.connect(user1).approve(this.vault.address, 1000);
      await expect(this.vault.connect(user1).withdraw(1000)).to.emit(this.vault, "Withdraw").withArgs(1000);
      currentToolieTokenBalance += 1000;
      currentVaultTokenBalance -= 1000 * initialExchangeRate; // deposit 1000, wd 1000
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
      expect(await this.vault.totalSupply()).to.be.equal(currentVaultTokenBalance);

      await this.vault.connect(this.signers.admin).setExchangeRate(exchangeRateWad1);
      await this.vault.connect(user1).approve(this.vault.address, 1000);
      await this.vault.connect(user1).withdraw(1000);
      currentToolieTokenBalance += 1000;
      currentVaultTokenBalance -= 1000 * exchangeRate1; // deposit 1000, wd 1000
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
      expect(await this.vault.totalSupply()).to.be.equal(currentVaultTokenBalance);

      await this.vault.connect(this.signers.admin).setExchangeRate(exchangeRateWad2);
      await this.vault.connect(user1).approve(this.vault.address, 1000);
      await this.vault.connect(user1).withdraw(200);
      currentToolieTokenBalance += 200;
      currentVaultTokenBalance -= 200 * exchangeRate2; // deposit 1000, wd 1000
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(currentToolieTokenBalance);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(currentVaultTokenBalance);
      expect(await this.vault.totalSupply()).to.be.equal(currentVaultTokenBalance);
    });

    it("#withdraw() should be able to withdraw the total amount of vault tokens", async function () {
      await this.vault.connect(user1).approve(this.vault.address, 5000);
      await this.vault.connect(user1).withdraw(5000);
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(0);
      expect(await this.vault.totalSupply()).to.be.equal(0);
    });

    it("#deposit() should be able to deposit additional amounts", async function () {
      await this.toolieToken.connect(user1).approve(this.vault.address, 100);
      await this.vault.connect(user1).deposit(100);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal((5000 + 100) * initialExchangeRate);
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount - 5100);
    });
  });
});
