import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Registry } from "../../typechain/Registry";
import { Signers } from "../types";
import { expect } from "chai";
import { TASK_COMPILE_SOLIDITY_COMPILE } from "hardhat/builtin-tasks/task-names";

const { deployContract } = hre.waffle;

describe("Registry Unit tests", function () {
  this.timeout(0);

  let user: SignerWithAddress;
  let owner: SignerWithAddress;
  let name: string;

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers = {
      admin: signers[0],
      user1: signers[1],
      user2: signers[2],
    } as Signers;
  });

  beforeEach(async function () {
    const registryArtifact: Artifact = await hre.artifacts.readArtifact("Registry");
    this.registry = <Registry>await deployContract(this.signers.admin, registryArtifact);
  });

  describe("#claimName()", function () {
    it("should allow names to be claimed", async function () {
      name = "booyah";
      user = this.signers.user1;

      await this.registry.connect(user).claimName(name);

      const newOwner = await this.registry.claimedNames(name);
      expect(newOwner).to.be.equal(user.address);
    });

    it("should not allow claimed names to be claimed", async function () {
      name = "booyah";
      user = this.signers.user1;
      owner = this.signers.user2;

      await this.registry.connect(owner).claimName(name);
      await expect(this.registry.connect(user).claimName(name)).to.be.revertedWith("Name already claimed");
    });
  });

  describe("#releaseName()", function () {
    it("should allow owners to release names", async function () {
      name = "booyah";
      owner = this.signers.user1;
      user = owner;

      await this.registry.connect(owner).claimName(name);
      await this.registry.connect(user).releaseName(name);
      const newOwner = await this.registry.claimedNames(name);
      expect(newOwner, "0x0000000000000000000000000000000000000000");
    });

    it("should not allow non-owners to release names", async function () {
      name = "booyah";
      owner = this.signers.user1;
      user = this.signers.user2;

      await this.registry.connect(owner).claimName(name);
      await expect(this.registry.connect(user).releaseName(name)).to.be.revertedWith("Unauthorized");
    });
  });
});
