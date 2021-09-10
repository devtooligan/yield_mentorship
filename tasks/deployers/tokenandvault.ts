import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import {
  Dai,
  Dai__factory,
  Vault4,
  Vault4__factory,
  MockPriceFeedAggregator,
  MockPriceFeedAggregator__factory,
} from "../../typechain";

task("deploy:TokenAndVault4WithOracle").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const mockPriceFeedAggregatorFactory: MockPriceFeedAggregator__factory = await ethers.getContractFactory(
    "MockPriceFeedAggregator",
  );
  const mockPriceFeedAggregator: MockPriceFeedAggregator = <MockPriceFeedAggregator>(
    await mockPriceFeedAggregatorFactory.deploy(1)
  );
  await mockPriceFeedAggregator.deployed();
  console.log("MockPriceFeedAggregator deployed to: ", mockPriceFeedAggregator.address);

  const daiFactory: Dai__factory = await ethers.getContractFactory("Dai");
  const { chainId } = await ethers.provider.getNetwork();
  const dai: Dai = <Dai>await daiFactory.deploy(chainId);
  await dai.deployed();
  console.log("Dai deployed to: ", dai.address);
  const vault4Factory: Vault4__factory = await ethers.getContractFactory("Vault4");
  const vault: Vault4 = <Vault4>await vault4Factory.deploy(dai.address, mockPriceFeedAggregator.address);
  await vault.deployed();
  console.log("Vault deployed to: ", vault.address);
});
