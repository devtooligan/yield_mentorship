import hre from "hardhat";
import { BigNumber } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Signers } from "../types";
import { expect } from "chai";
import { Dai, TooliganToken, AMMCore, AMMRouter } from "../../typechain";

const { deployContract } = hre.waffle;

describe("AMM Unit tests", function () {
  this.timeout(0);

  let user1: SignerWithAddress; // assigned to this.signers[1]
  let user2: SignerWithAddress; // assigned to this.signers[2]
  let admin: SignerWithAddress; // assigned to this.signers[2]

  const WAD = BigNumber.from("1" + "0".repeat(18));

  const adminStartingTooliesWad = WAD.mul(10);
  const user1StartingTooliesWad = WAD.mul(40);
  const user2StartingTooliesWad = WAD.mul(30);
  const adminStartingDaiWad = WAD.mul(20);
  const user1StartingDaiWad = WAD.mul(10);
  const user2StartingDaiWad = WAD.mul(30);

  before(async function () {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers = {
      admin: signers[0],
      user1: signers[1],
      user2: signers[2],
    } as Signers;
    user1 = this.signers.user1;
    user2 = this.signers.user2;
    admin = this.signers.admin;
  });

  beforeEach(async function () {
    this.tokenX = <TooliganToken>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("TooliganToken"))
    );
    this.tokenY = <Dai>await deployContract(this.signers.admin, await hre.artifacts.readArtifact("Dai"), [1]);
    this.core = <AMMCore>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("AMMCore"), [
        this.tokenX.address,
        this.tokenY.address,
      ])
    );
    this.amm = <AMMRouter>(
      await deployContract(this.signers.admin, await hre.artifacts.readArtifact("AMMRouter"), [
        this.core.address,
        this.tokenX.address,
        this.tokenY.address,
      ])
    );

    // Fund wallets with Toolies
    await this.tokenX.mint(admin.address, adminStartingTooliesWad);
    await this.tokenX.mint(user1.address, user1StartingTooliesWad);
    await this.tokenX.mint(user2.address, user2StartingTooliesWad);

    // Fund wallets with Dai
    await this.tokenY.mint(admin.address, adminStartingDaiWad);
    await this.tokenY.mint(user1.address, user1StartingDaiWad);
    await this.tokenY.mint(user2.address, user2StartingDaiWad);
  });

  describe("without initialization", function () {
    it("#mint() should not allow minting before initialization", async function () {
      const xAmount = user1StartingTooliesWad; // 5
      const yAmount = user1StartingDaiWad; // 10
      await this.tokenY.connect(user1).approve(this.amm.address, yAmount);
      await this.tokenX.connect(user1).approve(this.amm.address, xAmount);
      await expect(this.amm.connect(user1).mint(xAmount, yAmount)).to.be.revertedWith("Not initialized");
    });

    it("#sellX() should not allow swapping before initialization", async function () {
      const xAmount = user1StartingTooliesWad; // 5
      const yAmount = user1StartingDaiWad; // 10
      await this.tokenY.connect(user1).approve(this.amm.address, yAmount);
      await this.tokenX.connect(user1).approve(this.amm.address, xAmount);
      await expect(this.amm.connect(user1).sellX(xAmount)).to.be.revertedWith("Not initialized");
      await expect(this.amm.connect(user1).sellY(yAmount)).to.be.revertedWith("Not initialized");
    });

    it("#init() should not allow initialization by non-owner", async function () {
      await this.tokenX.connect(user1).approve(this.core.address, user1StartingTooliesWad);
      await this.tokenY.connect(user1).approve(this.core.address, user1StartingDaiWad);
      await expect(this.core.connect(user1).init(user1StartingTooliesWad, user1StartingDaiWad)).to.be.revertedWith(
        "Unauthorized",
      );
    });

    it("#init() should initialize", async function () {
      await this.tokenX.connect(admin).approve(this.core.address, adminStartingTooliesWad);
      await this.tokenY.connect(admin).approve(this.core.address, adminStartingDaiWad);
      const newK = adminStartingDaiWad.mul(adminStartingTooliesWad).div(WAD);
      await expect(this.core.connect(admin).init(adminStartingTooliesWad, adminStartingDaiWad))
        .to.emit(this.core, "Initialized")
        .withArgs(newK);
      expect(await this.core.balanceOf(admin.address)).to.equal(newK);
      const reserve = await this.core.reserve();
      const xReserve = await reserve.x;
      const yReserve = await reserve.y;
      expect(xReserve).to.equal(adminStartingTooliesWad);
      expect(yReserve).to.equal(adminStartingDaiWad);
    });
  });

  describe("initialized", async function () {
    beforeEach(async function () {
      await this.tokenX.connect(admin).approve(this.core.address, adminStartingTooliesWad);
      await this.tokenY.connect(admin).approve(this.core.address, adminStartingDaiWad);
      // 10 : 20   k=200
      await this.core.connect(admin).init(adminStartingTooliesWad, adminStartingDaiWad);
    });

    it("#init() should not allow initialization more than once", async function () {
      await this.tokenX.connect(admin).approve(this.core.address, adminStartingTooliesWad);
      await this.tokenY.connect(admin).approve(this.core.address, adminStartingDaiWad);
      await expect(this.core.connect(admin).init(adminStartingTooliesWad, adminStartingDaiWad)).to.be.revertedWith(
        "Previously initialized",
      );
    });

    it("#mint() should not allow unbalanced amounts for minting LP", async function () {
      const xAmount = user1StartingDaiWad; // 10
      const yAmount = user1StartingDaiWad; // 10
      await this.tokenY.connect(user1).approve(this.amm.address, yAmount);
      await this.tokenX.connect(user1).approve(this.amm.address, xAmount);
      await expect(this.amm.connect(user1).mint(xAmount, yAmount)).to.be.revertedWith("Invalid amounts");
    });

    it("#sellX() should allow selling of tokenX ", async function () {
      const xAmount = WAD.mul("10");
      const expectedYAmount = WAD.mul("10");
      await this.tokenX.connect(user1).approve(this.amm.address, xAmount);
      await expect(this.amm.connect(user1).sellX(xAmount))
        .to.emit(this.core, "Swapped")
        .withArgs(user1.address, this.tokenX.address, xAmount, expectedYAmount);
      const reserve = await this.core.reserve();
      const xReserve = await reserve.x;
      const yReserve = await reserve.y;
      expect(xReserve).to.equal(xAmount.add(adminStartingTooliesWad));
      expect(yReserve).to.equal(adminStartingDaiWad.sub(expectedYAmount));
    });

    it("#sellY() should allow selling of tokenY ", async function () {
      const yAmount = WAD.mul("5");
      const expectedXAmount = WAD.mul("2");
      await this.tokenY.connect(user1).approve(this.amm.address, yAmount);
      await expect(this.amm.connect(user1).sellY(yAmount))
        .to.emit(this.core, "Swapped")
        .withArgs(user1.address, this.tokenY.address, yAmount, expectedXAmount);
      const reserve = await this.core.reserve();
      const xReserve = await reserve.x;
      const yReserve = await reserve.y;
      expect(xReserve).to.equal(adminStartingTooliesWad.sub(expectedXAmount));
      expect(yReserve).to.equal(adminStartingDaiWad.add(yAmount));
    });

    it("#mint() should mint", async function () {
      const xAmount = WAD.mul("5");
      const yAmount = WAD.mul("10");
      await this.tokenY.connect(user1).approve(this.amm.address, yAmount);
      await this.tokenX.connect(user1).approve(this.amm.address, xAmount);
      const minted = WAD.mul((10 / 20) * 200);
      await expect(this.amm.connect(user1).mint(xAmount, yAmount))
        .to.emit(this.core, "Minted")
        .withArgs(user1.address, minted); // half the original 200
      expect(await this.core.balanceOf(user1.address)).to.equal(minted);
      const reserve = await this.core.reserve();
      const xReserve = await reserve.x;
      const yReserve = await reserve.y;
      expect(xReserve).to.equal(xAmount.add(adminStartingTooliesWad));
      expect(yReserve).to.equal(yAmount.add(adminStartingDaiWad));
    });
  });
});
