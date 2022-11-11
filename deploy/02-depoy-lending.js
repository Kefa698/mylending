const { network, ethers } = require("hardhat")
const {
    VERIFICATION_BLOCK_CONFIRMATIONS,
    developmentChains,
    networkConfig,
} = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("...............................................................")
    const args = []
    const lendingDepoyment = await deploy("Lending", {
        from: deployer,
        log: true,
        args: args,
        waitBlockConfirmations: waitBlockConfirmations,
    })
    ////////verify deployment
    if (!developmentChains.includes(network.name) && process.env.ETHASCAN_API_KEY) {
        log("verifying.................................................")
        await verify(lendingDepoyment.address, args)
    }
    log("..................................")

    ////setting up lending contract

    const lending = await ethers.getContract("Lending")
    if (network.config.chainId == "31337") {
        const dai = await ethers.getContract("DAI")
        const wbtc = await ethers.getContract("WBTC")
        const daiEthPriceFeed = await ethers.getContract("DAIETHPriceFeed")
        const wbtcEthPriceFeed = await ethers.getContract("WBTCETHPriceFeed")

        await lending.setAllowedToken(dai.address, daiEthPriceFeed.address)
        await lending.setAllowedToken(wbtc.address, wbtcEthPriceFeed.address)
    } else {
        await lending.setAllowedToken(
            networkConfig[network.config.chainId]["dai"],
            networkConfig[network.config.chainId]["daiEthPricefeed"]
        )
        await lending.setAllowedToken(
            networkConfig[network.config.chainId]["wbtc"],
            networkConfig[network.config.chainId]["wbtEthPricefeed"]
        )
    }
}
module.exports.tags = ["all", "lending"]
