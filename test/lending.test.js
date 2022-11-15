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
          describe("withdraw", function () {
              it("withraws and emits an event", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  expect(await lending.withdraw(wbtc.address, depositAmount)).to.emit("Withdraw")
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert(accountInfo[0].toString() == ethers.utils.parseEther("0"))
                  assert(accountInfo[1].toString() == ethers.utils.parseEther("0"))
              })
              it("reverts if there isnt eneogh money", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  await expect(
                      lending.withdraw(wbtc.address, depositAmount.mul(2))
                  ).to.be.revertedWith("Not enough funds")
              })
          })
          describe("borrow", function () {
              it("cant pull money that would make the platform go insolvent", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  // Setup the contract to have enough DAI to borrow
                  // Our daiBorrowAmount is set to 80% of 2000 + 1, since the threshold is 80%
                  // And this should be enought to not let us borrow this amount
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100) + 1).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)

                  console.log(
                      `Going to attempt to borrow ${ethers.utils.formatEther(
                          daiEthValue
                      )} ETH worth of DAI (${ethers.utils.formatEther(daiBorrowAmount)} DAI)\n`
                  )
                  console.log(
                      `With only ${ethers.utils.formatEther(
                          wbtcEthValue
                      )} ETH of WBTC (${ethers.utils.formatEther(
                          depositAmount
                      )} WBTC) deposited. \n`
                  )
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)

                  //jst to be safe..lets connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  const playerAccount = await lending.getAccountInformation(player.address)
                  const deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert(playerAccount[0].toString() == "0")
                  assert(playerAccount[1].toString() == daiEthValue)
                  assert(deployerAccount[0].toString() == "0")
                  assert(deployerAccount[1].toString() == wbtcEthValue)
                  ///then lets attempt to borrow
                  await expect(lending.borrow(dai.address, daiBorrowAmount)).to.be.revertedWith(
                      "Platform will go insolvent!"
                  )
              })
              it("borrows and emits an event", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  ///same as the above but wth one minor differnce
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  const daiEthValue = await lending.getEthValue(dai.address, daiBorrowAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)

                  console.log(
                      `Going to attempt to borrow ${ethers.utils.formatEther(
                          daiEthValue
                      )} ETH worth of DAI (${ethers.utils.formatEther(daiBorrowAmount)} DAI)\n`
                  )
                  console.log(
                      `With only ${ethers.utils.formatEther(
                          wbtcEthValue
                      )} ETH of WBTC (${ethers.utils.formatEther(
                          depositAmount
                      )} WBTC) deposited. \n`
                  )
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)

                  //jst to be safe..lets connect back
                  await dai.connect(deployer)
                  await lending.connect(deployer)
                  const playerAccount = await lending.getAccountInformation(player.address)
                  let deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert(playerAccount[0].toString() == "0")
                  assert(playerAccount[1].toString() == daiEthValue)
                  assert(deployerAccount[0].toString() == "0")
                  assert(deployerAccount[1].toString() == wbtcEthValue)
                  ///then lets borrow
                  expect(await lending.borrow(dai.address, daiBorrowAmount)).to.emit("Borrow")

                  const healthFactor = await lending.healthFactor(deployer.address)
                  deployerAccount = await lending.getAccountInformation(deployer.address)
                  assert.equal(deployerAccount[0].toString(), daiEthValue)
                  assert.equal(deployerAccount[1].toString(), wbtcEthValue)
                  assert.equal(healthFactor.toString(), ethers.utils.parseEther("1").toString())
              })
          })
          describe("Repay", function () {
              it("repays debt and emits an event", async function () {
                  await wbtc.approve(lending.address, depositAmount)
                  await lending.deposit(wbtc.address, depositAmount)
                  const wbtcEthValue = await lending.getEthValue(wbtc.address, depositAmount)
                  //let player deposit dai
                  const daiBorrowAmount = ethers.utils.parseEther(
                      (2000 * (threshold.toNumber() / 100)).toString()
                  )
                  await dai.transfer(player.address, daiBorrowAmount)
                  const playerConnectedLending = await lending.connect(player)
                  const playerConnectedDai = await dai.connect(player)
                  await playerConnectedDai.approve(lending.address, daiBorrowAmount)
                  await playerConnectedLending.deposit(dai.address, daiBorrowAmount)

                  ///just to be safe lets connect back
                  await lending.connect(deployer)
                  await dai.connect(deployer)

                  //lets borrow
                  await lending.borrow(dai.address, daiBorrowAmount)
                  //lets repay
                  await dai.approve(lending.address, daiBorrowAmount)
                  await lending.repay(dai.address, daiBorrowAmount)
                  const accountInfo = await lending.getAccountInformation(deployer.address)
                  assert(accountInfo[0].toString(),"0")
                  assert(accountInfo[1].toString(),daiBorrowAmount)
              })
          })
      })
