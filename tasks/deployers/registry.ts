import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { Registry, Registry__factory } from "../../typechain";

task("deploy:Registry").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const registryFactory: Registry__factory = await ethers.getContractFactory("Registry");
  const registry: Registry = <Registry>await registryFactory.deploy();
  await registry.deployed();
  console.log("Registry deployed to: ", registry.address);
});
