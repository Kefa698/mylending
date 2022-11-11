const { network } = require("hardhat")
const { VERIFICATION_BLOCK_CONFIRMATIONS, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("...............................................................")
    const args = []
    const rewardToken = await deploy("RewardToken", {
        from: deployer,
        log: true,
        args: args,
        waitBlockConfirmations: waitBlockConfirmations,
    })
    ////////verify deployment
    if (!developmentChains.includes(network.name) && process.env.ETHASCAN_API_KEY) {
        log("verifying.................................................")
        await verify(rewardToken.address, args)
    }
    log("..................................")
}
module.exports.tags = ["all", "rewardtoken"]
