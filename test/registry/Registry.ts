import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Registry } from "../../typechain/Registry";
import { Signers } from "../types";
import { expect } from "chai";

const { deployContract } = hre.waffle;

describe("Registry Unit tests", function () {
  this.timeout(0);

  let user: SignerWithAddress; // will always be this.signers.user1
  let owner: SignerWithAddress;
  const name: string = "booyah";

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers = {
      admin: signers[0],
      user1: signers[1],
      user2: signers[2],
    } as Signers;

    user = this.signers.user1;
  });

  beforeEach(async function () {
    const registryArtifact: Artifact = await hre.artifacts.readArtifact("Registry");
    this.registry = <Registry>await deployContract(this.signers.admin, registryArtifact);
  });

  describe("with no names claimed", function () {
    it("#releaseName() should not allow unclaimed names to be released", async function () {
      await expect(this.registry.connect(user).releaseName(name)).to.be.revertedWith("Unauthorized");
    });

    it("#claimName() should allow unclaimed names to be claimed", async function () {
      await this.registry.connect(user).claimName(name);

      const newOwner = await this.registry.claimedNames(name);
      expect(newOwner).to.be.equal(user.address);
    });

    describe("with one name claimed by another user", function () {
      beforeEach(async function () {
        owner = this.signers.user1;
        user = this.signers.user2;
        await this.registry.connect(owner).claimName(name);
      });

      it("#claimName() should not allow claimed names to be claimed", async function () {
        await expect(this.registry.connect(user).claimName(name)).to.be.revertedWith("Name already claimed");
      });

      it("#releaseName() should not allow non-owners to release names", async function () {
        await expect(this.registry.connect(user).releaseName(name)).to.be.revertedWith("Unauthorized");
      });

      it("#claimName() should allow user to claim another name", async function () {
        const anotherName = "hoohah";

        await this.registry.connect(user).claimName(anotherName);

        const newOwner = await this.registry.claimedNames(anotherName);
        expect(newOwner).to.be.equal(user.address);
      });
    });

    describe("with one name previously claimed by user", async function () {
      beforeEach(async function () {
        owner = this.signers.user1;
        user = owner;
        await this.registry.connect(owner).claimName(name);
      });

      it("#claimName() should not allow a user to claim a name they already own", async function () {
        await expect(this.registry.connect(user).claimName(name)).to.be.revertedWith("Name already claimed");
      });

      it("#claimName() should allow users to claim more than one name in the registry", async function () {
        const anotherName = "hoohah";

        await this.registry.connect(user).claimName(anotherName);

        const newOwner = await this.registry.claimedNames(anotherName);
        expect(newOwner).to.be.equal(user.address);
      });

      it("#releaseName() should allow user to release a name they own", async function () {
        await this.registry.connect(user).releaseName(name);

        const currentOwner = await this.registry.claimedNames(name);
        expect(currentOwner, "0x0000000000000000000000000000000000000000");
      });
    });
  });
});
