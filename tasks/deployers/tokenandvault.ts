import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { TooliganToken, TooliganToken__factory, Vault3, Vault3__factory } from "../../typechain";

task("deploy:TokenAndVault3").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const tooliganTokenFactory: TooliganToken__factory = await ethers.getContractFactory("TooliganToken");
  const tooliganToken: TooliganToken = <TooliganToken>await tooliganTokenFactory.deploy();
  await tooliganToken.deployed();
  console.log("TooliganToken deployed to: ", tooliganToken.address);
  const vault3Factory: Vault3__factory = await ethers.getContractFactory("Vault3");
  const vault: Vault3 = <Vault3>await vault3Factory.deploy(tooliganToken.address, 1);
  await vault.deployed();
  console.log("Vault deployed to: ", vault.address);
});
