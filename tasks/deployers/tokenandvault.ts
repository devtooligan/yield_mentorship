import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { TooliganToken, TooliganToken__factory, Vault2, Vault2__factory } from "../../typechain";

task("deploy:TokenAndVault2").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const tooliganTokenFactory: TooliganToken__factory = await ethers.getContractFactory("TooliganToken");
  const tooliganToken: TooliganToken = <TooliganToken>await tooliganTokenFactory.deploy();
  await tooliganToken.deployed();
  console.log("TooliganToken deployed to: ", tooliganToken.address);
  const vault2Factory: Vault2__factory = await ethers.getContractFactory("Vault2");
  const vault: Vault2 = <Vault2>await vault2Factory.deploy(tooliganToken.address);
  await vault.deployed();
  console.log("Vault deployed to: ", vault.address);
});
