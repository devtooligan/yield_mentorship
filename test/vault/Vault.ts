import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { TooliganToken } from "../../typechain";

const { deployContract } = hre.waffle;

describe("Vault Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]
  const depositAmount: number = 1000; //
  const depositAmount2: number = 50; //
  const withdrawAmount: number = 500; //

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
    this.token = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );
    await this.token.mint(user1.address, 10000);
    await this.token.mint(user2.address, 10000);
    this.vault = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Vault"), [this.token.address])
    );
  });

  describe("with no balances", function () {
    it("#withdraw() should not be able to withdraw without a balance", async function () {
      await expect(this.vault.connect(user1).withdraw(withdrawAmount)).to.be.reverted;
      // ^^ I couldn't figure out how to access the ERC-20 generated error message here
      // Is there a way?  How can I learn more about this?
    });

    it("#deposit() should not be able to deposit without approving first", async function () {
      await expect(this.vault.connect(user1).deposit(depositAmount)).to.be.revertedWith("Approve deposit first");
    });

    describe("with approved amounts", function () {
      beforeEach(async function () {
        await this.token.connect(user1).approve(this.vault.address, depositAmount);
        await this.token.connect(user2).approve(this.vault.address, depositAmount);
      });

      it("#deposit() should not be able to deposit more than approved", async function () {
        await expect(this.vault.connect(user1).deposit(depositAmount + 10)).to.be.revertedWith("Approve deposit first");
      });

      it("#deposit() should allow deposits from one or more users", async function () {
        await expect(this.vault.connect(user1).deposit(depositAmount))
          .to.emit(this.vault, "Deposit")
          .withArgs(depositAmount);
        await this.vault.connect(user2).deposit(depositAmount2);
        expect(await this.vault.balances(user1.address)).to.be.equal(depositAmount);
        expect(await this.vault.balances(user2.address)).to.be.equal(depositAmount2);
      });
    });
  });

  describe("with balances", function () {
    beforeEach(async function () {
      await this.token.connect(user1).approve(this.vault.address, depositAmount);
      await this.vault.connect(user1).deposit(depositAmount);
      await this.token.connect(user2).approve(this.vault.address, depositAmount2);
      await this.vault.connect(user2).deposit(depositAmount2);
    });

    it("#withdraw() should not be able to withdraw more than balance", async function () {
      await expect(this.vault.connect(user1).withdraw(depositAmount + 10)).to.be.reverted;
    });

    it("#withdraw() should be able to withdraw up to the balance", async function () {
      await expect(this.vault.connect(user1).withdraw(withdrawAmount))
        .to.emit(this.vault, "Withdraw")
        .withArgs(withdrawAmount);
      await expect(this.vault.connect(user2).withdraw(depositAmount2)).to.not.be.reverted;
      expect(await this.vault.balances(user1.address)).to.be.equal(depositAmount - withdrawAmount);
      expect(await this.vault.balances(user2.address)).to.be.equal(0);
    });

    it("#deposit() should be able to increase balance", async function () {
      const additionalAmount = 100;
      await this.token.connect(user1).approve(this.vault.address, additionalAmount);
      await this.vault.connect(user1).deposit(additionalAmount);
      expect(await this.vault.balances(user1.address)).to.be.equal(depositAmount + additionalAmount);
    });
  });
});
