import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { Dai, Dai__factory, MultiCollateralVault, MultiCollateralVault__factory } from "../../typechain";

task("deploy:DaiAndMultiCollateralVault").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const daiFactory: Dai__factory = await ethers.getContractFactory("Dai");
  const { chainId } = await ethers.provider.getNetwork();
  const dai: Dai = <Dai>await daiFactory.deploy(chainId);
  await dai.deployed();
  console.log("Dai deployed to: ", dai.address);
  const multiCollateralVaultFactory: MultiCollateralVault__factory = await ethers.getContractFactory(
    "MultiCollateralVault",
  );
  const vault: MultiCollateralVault = <MultiCollateralVault>await multiCollateralVaultFactory.deploy(dai.address);
  await vault.deployed();
  console.log("Vault deployed to: ", vault.address);
});
