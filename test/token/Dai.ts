import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Dai } from "../../typechain";

const { deployContract } = hre.waffle;

describe("Dai", function () {
  this.timeout(0);

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.token = <Dai>await deployContract(signers[0], await hre.artifacts.readArtifact("Dai"));
    this.admin = signers[0];
    this.user1 = signers[1];
  });

  it("should mint", async function () {
    const mintAmount = 100;
    await expect(this.token.connect(this.admin).mint(this.user1.address, mintAmount)).to.not.be.reverted;

    expect(await this.token.connect(this.admin).balanceOf(this.user1.address)).to.equal(mintAmount);
  });
});
