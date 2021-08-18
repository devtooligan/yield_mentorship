import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { TooliganToken } from "../../typechain";

const { deployContract } = hre.waffle;

describe("TooliganToken", function () {
  this.timeout(0);

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.token = <TooliganToken>await deployContract(signers[0], await hre.artifacts.readArtifact("TooliganToken"));
    this.user1 = signers[1];
  });

  it("should mint", async function () {
    const mintAmount = 100;
    await expect(this.token.connect(this.user1).mint(this.user1.address, mintAmount)).to.not.be.reverted;

    expect(await this.token.connect(this.user1).balanceOf(this.user1.address)).to.equal(mintAmount);
  });
});
