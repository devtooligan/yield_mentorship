import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import {
  Dai,
  Dai__factory,
  TooliganToken,
  TooliganToken__factory,
  AMMCore,
  AMMCore__factory,
  AMMRouter,
  AMMRouter__factory,
} from "../../typechain";

task("deploy:TokenAndVault4WithOracle").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const daiFactory: Dai__factory = await ethers.getContractFactory("Dai");
  const { chainId } = await ethers.provider.getNetwork();
  const dai: Dai = <Dai>await daiFactory.deploy(chainId);
  await dai.deployed();
  console.log("Dai deployed to: ", dai.address);

  const tooliganTokenFactory: TooliganToken__factory = await ethers.getContractFactory("TooliganToken");
  const tooliganToken: TooliganToken = <TooliganToken>await tooliganTokenFactory.deploy();
  await tooliganToken.deployed();
  console.log("TooliganToken deployed to: ", tooliganToken.address);

  const ammCoreFactory: AMMCore__factory = await ethers.getContractFactory("AMMCore");
  const ammCore: AMMCore = <AMMCore>await ammCoreFactory.deploy(tooliganToken.address, dai.address);
  await ammCore.deployed();
  console.log("AMMCore deployed to: ", ammCore.address);

  const ammRouterFactory: AMMRouter__factory = await ethers.getContractFactory("AMMRouter");
  const ammRouter: AMMRouter = <AMMRouter>(
    await ammRouterFactory.deploy(ammCore.address, tooliganToken.address, dai.address)
  );
  await ammRouter.deployed();
  console.log("AMMRouter deployed to: ", ammRouter.address);
});
