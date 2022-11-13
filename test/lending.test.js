const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")
const { moveBlocks } = require("../utils/move-blocks")
const { moveTime } = require("../utils/move-time")

const BTC_UPDATED_PRICE = ethers.utils.parseEther("1.9")
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lending Unit Tests", function () {
          let lending, dai, wbtc, depositAmount, randomToken, player, threshold, wbtcEthPriceFeed
          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["mocks", "lending"])
              lending = await ethers.getContract("Lending")
              wbtc = await ethers.getContract("WBTC")
              dai = await ethers.getContract("DAI")
              randomToken = await ethers.getContract("RandomToken")
              daiEthPriceFeed = await ethers.getContract("DAI")
              depositAmount = ethers.utils.parseEther("1")
              threshold = await lending.LIQUIDATION_THRESHOLD()
              wbtcEthPriceFeed = await ethers.getContract("WBTCETHPriceFeed")
          })
          describe("getEthValue", function () {
            // 1 DAI = $1 & ETH = $1,0000
            it("Correctly gets DAI price", async function () {
                const oneEthOfDai = ethers.utils.parseEther("1000")
                const ethValueOfDai = await lending.getEthValue(dai.address, oneEthOfDai)
                assert.equal(ethValueOfDai.toString(), ethers.utils.parseEther("1").toString())
            })
            it("Correctly gets WBTC price", async function () {
                // 1 WBTC = $2,000 & ETH = $1,000
                const oneEthOfWbtc = ethers.utils.parseEther("1")
                const ethValueOfWbtc = await lending.getEthValue(wbtc.address, oneEthOfWbtc)
                assert.equal(ethValueOfWbtc.toString(), ethers.utils.parseEther("2").toString())
            })
        })
      })
