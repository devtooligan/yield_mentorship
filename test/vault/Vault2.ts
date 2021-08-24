import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { TooliganToken, Vault2 } from "../../typechain";

const { deployContract } = hre.waffle;

describe("Vault2 Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]
  const mintAmount: number = 10000; // user1 and user2 mint this many Toolies

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
    this.vault = <Vault2>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Vault2"), [this.toolieToken.address])
    );
  });

  describe("without approval", function () {
    it("#deposit() should not be able to deposit without approving first", async function () {
      await expect(this.vault.connect(user1).deposit(1000)).to.be.revertedWith("ERC20: Insufficient approval");
    });

    describe("with approved amounts", function () {
      beforeEach(async function () {
        await this.vault.connect(user1).approve(this.vault.address, 500);
        await this.toolieToken.connect(user1).approve(this.vault.address, 1000);
        await this.toolieToken.connect(user2).approve(this.vault.address, 50);
      });

      it("#withdraw() should not be able to withdraw without holding vault tokens", async function () {
        await expect(this.vault.connect(user1).withdraw(500)).to.be.revertedWith("ERC20: Insufficient balance");
      });

      it("#deposit() should allow deposits from one or more users", async function () {
        await expect(this.vault.connect(user1).deposit(1000)).to.emit(this.vault, "Deposit").withArgs(1000);
        await this.vault.connect(user2).deposit(50);

        expect(await this.vault.balanceOf(user1.address)).to.be.equal(1000);
        expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount - 1000);
        expect(await this.vault.balanceOf(user2.address)).to.be.equal(50);
        expect(await this.toolieToken.balanceOf(user2.address)).to.be.equal(mintAmount - 50);
        expect(await this.vault.totalSupply()).to.be.equal(1050);
      });
    });
  });

  describe("with a balance of vault tokens", function () {
    beforeEach(async function () {
      await this.toolieToken.connect(user1).approve(this.vault.address, 1000);
      await this.vault.connect(user1).deposit(1000);
    });

    it("#withdraw() should be able to withdraw less than the amount of vault tokens held", async function () {
      await this.vault.connect(user1).approve(this.vault.address, 500);
      await expect(this.vault.connect(user1).withdraw(500)).to.emit(this.vault, "Withdraw").withArgs(500);
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount - 1000 + 500);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(500);
      expect(await this.vault.totalSupply()).to.be.equal(500);
    });

    it("#withdraw() should be able to withdraw the total amount of vault tokens held", async function () {
      await this.vault.connect(user1).approve(this.vault.address, 1000);
      await expect(this.vault.connect(user1).withdraw(1000)).to.emit(this.vault, "Withdraw").withArgs(1000);
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(0);
      expect(await this.vault.totalSupply()).to.be.equal(0);
    });

    it("#deposit() should be able to deposit additional amounts", async function () {
      await this.toolieToken.connect(user1).approve(this.vault.address, 100);
      await this.vault.connect(user1).deposit(100);
      expect(await this.vault.balanceOf(user1.address)).to.be.equal(1000 + 100);
      expect(await this.toolieToken.balanceOf(user1.address)).to.be.equal(mintAmount - 1100);
    });
  });
});
