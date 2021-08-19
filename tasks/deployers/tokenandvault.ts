import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { TooliganToken, TooliganToken__factory, Vault, Vault__factory } from "../../typechain";

task("deploy:TokenAndVault").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const tooliganTokenFactory: TooliganToken__factory = await ethers.getContractFactory("TooliganToken");
  const tooliganToken: TooliganToken = <TooliganToken>await tooliganTokenFactory.deploy();
  await tooliganToken.deployed();
  console.log("TooliganToken deployed to: ", tooliganToken.address);
  const vaultFactory: Vault__factory = await ethers.getContractFactory("Vault");
  const vault: Vault = <Vault>await vaultFactory.deploy(tooliganToken.address);
  await vault.deployed();
  console.log("Vault deployed to: ", vault.address);
});
