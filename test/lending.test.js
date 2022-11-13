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
                  assert(ethValueOfWbtc.toString() == ethers.utils.parseEther("2").toString())
              })
          })
          describe("getTokenValueFromEth", function () {
              // 1 DAI = $1 & ETH = $1,0000
              it("correctly gets dai price", async function () {
                  const oneDaiOfEth = ethers.utils.parseEther("0.001")
                  const daiValueOfEth = await lending.getTokenValueFromEth(dai.address, oneDaiOfEth)
                  assert(daiValueOfEth.toString() == ethers.utils.parseEther("1").toString())
              })
              it("correctly gets wbtc price", async function () {
                  // 1 WBTC = $2,000 & ETH = $1,000
                  const oneWbtcOfEth = ethers.utils.parseEther("2")
                  const wbtcValueOfEth = await lending.getTokenValueFromEth(
                      wbtc.address,
                      oneWbtcOfEth
                  )
                  assert(wbtcValueOfEth.toString() == ethers.utils.parseEther("1").toString())
              })
          })
          describe("deposit", function () {
              it("deposits and emits an event", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  expect(await lending.deposit(wbtc.address, depositAmount)).to.emit("Deposit")
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert(accountInfo[0].toString() == ethers.utils.parseEther("0").toString())
                  ///wbtc is 2x eth price
                  assert(accountInfo[1].toString() == depositAmount.mul(2).toString())
                  const healthfactor = await lending.healthFactor(deployer.address)
                  assert(healthfactor.toString() == ethers.utils.parseEther("100").toString())
              })
              it("only allowed tokens can be deposited", async function () {
                  await randomToken.approve(lending.address, depositAmount)
                  await expect(
                      lending.deposit(randomToken.address, depositAmount)
                  ).to.be.revertedWith("TokenNotAllowed")
              })
          })
      })
