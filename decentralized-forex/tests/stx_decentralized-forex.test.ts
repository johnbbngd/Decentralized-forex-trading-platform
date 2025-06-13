import { describe, expect, it, beforeEach } from "vitest";

// Mock Clarity contract interface
interface ClarityContract {
  callPublic(method: string, args: any[], sender: string): Promise<any>;
  callReadOnly(method: string, args: any[]): Promise<any>;
}

// Mock contract implementation for testing
class MockForexDEXContract implements ClarityContract {
  private liquidityPools = new Map();
  private userLiquidity = new Map();
  private supportedCurrencies = new Map();
  private priceFeeds = new Map();
  private tradingStats = new Map();

  // Error constants
  private readonly ERR_NOT_AUTHORIZED = 100;
  private readonly ERR_INSUFFICIENT_BALANCE = 101;
  private readonly ERR_INSUFFICIENT_LIQUIDITY = 102;
  private readonly ERR_SLIPPAGE_TOO_HIGH = 103;
  private readonly ERR_INVALID_AMOUNT = 104;
  private readonly ERR_POOL_NOT_EXISTS = 105;
  private readonly ERR_ZERO_AMOUNT = 106;
  private readonly ERR_IDENTICAL_TOKENS = 107;
  private readonly ERR_POOL_EXISTS = 108;

  private readonly CONTRACT_OWNER = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE";
  private readonly FEE_RATE = 30; // 0.3%
  private readonly MIN_LIQUIDITY = 1000;

  private getTokenPair(tokenA: string, tokenB: string) {
    return tokenA < tokenB
      ? { tokenA, tokenB }
      : { tokenA: tokenB, tokenB: tokenA };
  }

  private sqrt(n: number): number {
    return Math.floor(Math.sqrt(n));
  }

  private calculateSlippage(
    amountIn: number,
    reserveIn: number,
    reserveOut: number
  ) {
    const amountInWithFee = amountIn * (10000 - this.FEE_RATE);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 10000 + amountInWithFee;
    const amountOut = Math.floor(numerator / denominator);
    const priceImpact = Math.floor((amountOut * 10000) / reserveOut);
    return { amountOut, priceImpact };
  }

  async callPublic(method: string, args: any[], sender: string): Promise<any> {
    switch (method) {
      case "add-supported-currency":
        return this.addSupportedCurrency(
          args[0],
          args[1],
          args[2],
          args[3],
          sender
        );
      case "update-price-feed":
        return this.updatePriceFeed(args[0], args[1], sender);
      case "create-pool":
        return this.createPool(args[0], args[1], args[2], args[3], sender);
      case "add-liquidity":
        return this.addLiquidity(
          args[0],
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          sender
        );
      case "remove-liquidity":
        return this.removeLiquidity(
          args[0],
          args[1],
          args[2],
          args[3],
          args[4],
          sender
        );
      case "swap-exact-tokens-for-tokens":
        return this.swapExactTokensForTokens(
          args[0],
          args[1],
          args[2],
          args[3],
          sender
        );
      case "swap-tokens-for-exact-tokens":
        return this.swapTokensForExactTokens(
          args[0],
          args[1],
          args[2],
          args[3],
          sender
        );
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async callReadOnly(method: string, args: any[]): Promise<any> {
    switch (method) {
      case "get-pool-info":
        return this.getPoolInfo(args[0], args[1]);
      case "get-user-liquidity":
        return this.getUserLiquidity(args[0], args[1], args[2]);
      case "get-amount-out":
        return this.getAmountOut(args[0], args[1], args[2]);
      case "get-amount-in":
        return this.getAmountIn(args[0], args[1], args[2]);
      case "get-trading-stats":
        return this.getTradingStats(args[0], args[1]);
      case "get-price-feed":
        return this.getPriceFeed(args[0]);
      case "is-supported-currency":
        return this.isSupportedCurrency(args[0]);
      default:
        throw new Error(`Unknown read-only method: ${method}`);
    }
  }

  private addSupportedCurrency(
    token: string,
    name: string,
    symbol: string,
    decimals: number,
    sender: string
  ) {
    if (sender !== this.CONTRACT_OWNER) {
      return { isOk: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.supportedCurrencies.set(token, {
      name,
      symbol,
      decimals,
      isActive: true,
    });
    return { isOk: true, value: true };
  }

  private updatePriceFeed(token: string, price: number, sender: string) {
    if (sender !== this.CONTRACT_OWNER) {
      return { isOk: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.priceFeeds.set(token, { price, lastUpdate: 1000, isValid: true });
    return { isOk: true, value: true };
  }

  private createPool(
    tokenA: string,
    tokenB: string,
    amountA: number,
    amountB: number,
    sender: string
  ) {
    if (tokenA === tokenB) {
      return { isOk: false, value: this.ERR_IDENTICAL_TOKENS };
    }
    if (amountA <= 0 || amountB <= 0) {
      return { isOk: false, value: this.ERR_ZERO_AMOUNT };
    }

    const pair = this.getTokenPair(tokenA, tokenB);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;

    if (this.liquidityPools.has(pairKey)) {
      return { isOk: false, value: this.ERR_POOL_EXISTS };
    }

    const sortedAmountA = tokenA === pair.tokenA ? amountA : amountB;
    const sortedAmountB = tokenA === pair.tokenA ? amountB : amountA;
    const liquidity = this.sqrt(sortedAmountA * sortedAmountB);

    if (liquidity < this.MIN_LIQUIDITY) {
      return { isOk: false, value: this.ERR_INSUFFICIENT_LIQUIDITY };
    }

    this.liquidityPools.set(pairKey, {
      reserveA: sortedAmountA,
      reserveB: sortedAmountB,
      totalSupply: liquidity,
      kLast: sortedAmountA * sortedAmountB,
    });

    const userKey = `${sender}-${pair.tokenA}-${pair.tokenB}`;
    this.userLiquidity.set(userKey, { shares: liquidity });

    return { isOk: true, value: liquidity };
  }

  private addLiquidity(
    tokenA: string,
    tokenB: string,
    amountADesired: number,
    amountBDesired: number,
    amountAMin: number,
    amountBMin: number,
    sender: string
  ) {
    const pair = this.getTokenPair(tokenA, tokenB);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) {
      return { isOk: false, value: this.ERR_POOL_NOT_EXISTS };
    }

    const amountBOptimal = Math.floor(
      (amountADesired * pool.reserveB) / pool.reserveA
    );
    const amountAOptimal = Math.floor(
      (amountBDesired * pool.reserveA) / pool.reserveB
    );

    let finalAmountA, finalAmountB;
    if (amountBOptimal <= amountBDesired) {
      finalAmountA = amountADesired;
      finalAmountB = amountBOptimal;
    } else {
      finalAmountA = amountAOptimal;
      finalAmountB = amountBDesired;
    }

    if (finalAmountA < amountAMin || finalAmountB < amountBMin) {
      return { isOk: false, value: this.ERR_SLIPPAGE_TOO_HIGH };
    }

    const liquidity = Math.min(
      Math.floor((finalAmountA * pool.totalSupply) / pool.reserveA),
      Math.floor((finalAmountB * pool.totalSupply) / pool.reserveB)
    );

    if (liquidity <= 0) {
      return { isOk: false, value: this.ERR_INSUFFICIENT_LIQUIDITY };
    }

    pool.reserveA += finalAmountA;
    pool.reserveB += finalAmountB;
    pool.totalSupply += liquidity;
    pool.kLast = pool.reserveA * pool.reserveB;

    const userKey = `${sender}-${pair.tokenA}-${pair.tokenB}`;
    const currentShares = this.userLiquidity.get(userKey)?.shares || 0;
    this.userLiquidity.set(userKey, { shares: currentShares + liquidity });

    return { isOk: true, value: liquidity };
  }

  private removeLiquidity(
    tokenA: string,
    tokenB: string,
    liquidity: number,
    amountAMin: number,
    amountBMin: number,
    sender: string
  ) {
    const pair = this.getTokenPair(tokenA, tokenB);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) {
      return { isOk: false, value: this.ERR_POOL_NOT_EXISTS };
    }

    const userKey = `${sender}-${pair.tokenA}-${pair.tokenB}`;
    const userLp = this.userLiquidity.get(userKey);

    if (!userLp || userLp.shares < liquidity) {
      return { isOk: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }

    const amountA = Math.floor((liquidity * pool.reserveA) / pool.totalSupply);
    const amountB = Math.floor((liquidity * pool.reserveB) / pool.totalSupply);

    if (amountA < amountAMin || amountB < amountBMin) {
      return { isOk: false, value: this.ERR_SLIPPAGE_TOO_HIGH };
    }

    if (userLp.shares === liquidity) {
      this.userLiquidity.delete(userKey);
    } else {
      userLp.shares -= liquidity;
    }

    pool.reserveA -= amountA;
    pool.reserveB -= amountB;
    pool.totalSupply -= liquidity;
    pool.kLast = pool.reserveA * pool.reserveB;

    return { isOk: true, value: { amountA, amountB } };
  }

  private swapExactTokensForTokens(
    amountIn: number,
    amountOutMin: number,
    tokenIn: string,
    tokenOut: string,
    sender: string
  ) {
    if (amountIn <= 0) {
      return { isOk: false, value: this.ERR_ZERO_AMOUNT };
    }

    const pair = this.getTokenPair(tokenIn, tokenOut);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) {
      return { isOk: false, value: this.ERR_POOL_NOT_EXISTS };
    }

    const isTokenAIn = tokenIn === pair.tokenA;
    const reserveIn = isTokenAIn ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenAIn ? pool.reserveB : pool.reserveA;

    const { amountOut } = this.calculateSlippage(
      amountIn,
      reserveIn,
      reserveOut
    );

    if (amountOut < amountOutMin) {
      return { isOk: false, value: this.ERR_SLIPPAGE_TOO_HIGH };
    }
    if (amountOut <= 0) {
      return { isOk: false, value: this.ERR_INSUFFICIENT_LIQUIDITY };
    }

    if (isTokenAIn) {
      pool.reserveA += amountIn;
      pool.reserveB -= amountOut;
    } else {
      pool.reserveB += amountIn;
      pool.reserveA -= amountOut;
    }
    pool.kLast = pool.reserveA * pool.reserveB;

    const currentStats = this.tradingStats.get(pairKey) || {
      volume24h: 0,
      tradesCount: 0,
      lastPrice: 0,
    };
    this.tradingStats.set(pairKey, {
      volume24h: currentStats.volume24h + amountIn,
      tradesCount: currentStats.tradesCount + 1,
      lastPrice: Math.floor((amountOut * 100000000) / amountIn),
    });

    return { isOk: true, value: amountOut };
  }

  private swapTokensForExactTokens(
    amountOut: number,
    amountInMax: number,
    tokenIn: string,
    tokenOut: string,
    sender: string
  ) {
    if (amountOut <= 0) {
      return { isOk: false, value: this.ERR_ZERO_AMOUNT };
    }

    const pair = this.getTokenPair(tokenIn, tokenOut);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) {
      return { isOk: false, value: this.ERR_POOL_NOT_EXISTS };
    }

    const isTokenAIn = tokenIn === pair.tokenA;
    const reserveIn = isTokenAIn ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenAIn ? pool.reserveB : pool.reserveA;

    if (amountOut >= reserveOut) {
      return { isOk: false, value: this.ERR_INSUFFICIENT_LIQUIDITY };
    }

    const numerator = reserveIn * amountOut * 10000;
    const denominator = (reserveOut - amountOut) * (10000 - this.FEE_RATE);
    const amountIn = Math.floor(numerator / denominator) + 1;

    if (amountIn > amountInMax) {
      return { isOk: false, value: this.ERR_SLIPPAGE_TOO_HIGH };
    }

    if (isTokenAIn) {
      pool.reserveA += amountIn;
      pool.reserveB -= amountOut;
    } else {
      pool.reserveB += amountIn;
      pool.reserveA -= amountOut;
    }
    pool.kLast = pool.reserveA * pool.reserveB;

    return { isOk: true, value: amountIn };
  }

  private getPoolInfo(tokenA: string, tokenB: string) {
    const pair = this.getTokenPair(tokenA, tokenB);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    return this.liquidityPools.get(pairKey) || null;
  }

  private getUserLiquidity(user: string, tokenA: string, tokenB: string) {
    const pair = this.getTokenPair(tokenA, tokenB);
    const userKey = `${user}-${pair.tokenA}-${pair.tokenB}`;
    return this.userLiquidity.get(userKey) || null;
  }

  private getAmountOut(amountIn: number, tokenIn: string, tokenOut: string) {
    const pair = this.getTokenPair(tokenIn, tokenOut);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) return 0;

    const isTokenAIn = tokenIn === pair.tokenA;
    const reserveIn = isTokenAIn ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenAIn ? pool.reserveB : pool.reserveA;

    return this.calculateSlippage(amountIn, reserveIn, reserveOut).amountOut;
  }

  private getAmountIn(amountOut: number, tokenIn: string, tokenOut: string) {
    const pair = this.getTokenPair(tokenIn, tokenOut);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    const pool = this.liquidityPools.get(pairKey);

    if (!pool) return 0;

    const isTokenAIn = tokenIn === pair.tokenA;
    const reserveIn = isTokenAIn ? pool.reserveA : pool.reserveB;
    const reserveOut = isTokenAIn ? pool.reserveB : pool.reserveA;

    if (amountOut >= reserveOut) return Number.MAX_SAFE_INTEGER;

    const numerator = reserveIn * amountOut * 10000;
    const denominator = (reserveOut - amountOut) * (10000 - this.FEE_RATE);
    return Math.floor(numerator / denominator) + 1;
  }

  private getTradingStats(tokenA: string, tokenB: string) {
    const pair = this.getTokenPair(tokenA, tokenB);
    const pairKey = `${pair.tokenA}-${pair.tokenB}`;
    return this.tradingStats.get(pairKey) || null;
  }

  private getPriceFeed(token: string) {
    return this.priceFeeds.get(token) || null;
  }

  private isSupportedCurrency(token: string) {
    return this.supportedCurrencies.has(token);
  }
}

describe("Forex DEX Contract", () => {
  let contract: MockForexDEXContract;
  const owner = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE";
  const user1 = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
  const user2 = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
  const tokenUSD = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.usd-token";
  const tokenEUR = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.eur-token";
  const tokenGBP = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE.gbp-token";

  beforeEach(() => {
    contract = new MockForexDEXContract();
  });

  describe("Admin Functions", () => {
    it("should allow owner to add supported currency", async () => {
      const result = await contract.callPublic(
        "add-supported-currency",
        [tokenUSD, "US Dollar", "USD", 8],
        owner
      );

      expect(result.isOk).toBe(true);

      const isSupported = await contract.callReadOnly("is-supported-currency", [
        tokenUSD,
      ]);
      expect(isSupported).toBe(true);
    });

    it("should reject non-owner adding supported currency", async () => {
      const result = await contract.callPublic(
        "add-supported-currency",
        [tokenUSD, "US Dollar", "USD", 8],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(100);
    });

    it("should allow owner to update price feed", async () => {
      const result = await contract.callPublic(
        "update-price-feed",
        [tokenUSD, 100000000],
        owner
      );

      expect(result.isOk).toBe(true);

      const priceFeed = await contract.callReadOnly("get-price-feed", [
        tokenUSD,
      ]);
      expect(priceFeed.price).toBe(100000000);
      expect(priceFeed.isValid).toBe(true);
    });

    it("should reject non-owner updating price feed", async () => {
      const result = await contract.callPublic(
        "update-price-feed",
        [tokenUSD, 100000000],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(100);
    });
  });

  describe("Pool Creation", () => {
    it("should create a new pool successfully", async () => {
      const result = await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 100000, 90000],
        user1
      );

      expect(result.isOk).toBe(true);
      expect(result.value).toBeGreaterThan(1000);

      const poolInfo = await contract.callReadOnly("get-pool-info", [
        tokenUSD,
        tokenEUR,
      ]);
      expect(poolInfo).toBeTruthy();
      expect(poolInfo.reserveA).toBe(100000);
      expect(poolInfo.reserveB).toBe(90000);
    });

    it("should reject creating pool with identical tokens", async () => {
      const result = await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenUSD, 100000, 90000],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(107);
    });

    it("should reject creating pool with zero amounts", async () => {
      const result = await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 0, 90000],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(106);
    });

    it("should reject creating pool with insufficient liquidity", async () => {
      const result = await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 10, 10],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(102);
    });

    it("should reject creating duplicate pool", async () => {
      await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 100000, 90000],
        user1
      );

      const result = await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 200000, 180000],
        user2
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(108);
    });

    it("should handle token ordering correctly", async () => {
      // Create pool with tokens in different order
      const result1 = await contract.callPublic(
        "create-pool",
        [tokenEUR, tokenUSD, 90000, 100000],
        user1
      );

      expect(result1.isOk).toBe(true);

      const poolInfo = await contract.callReadOnly("get-pool-info", [
        tokenUSD,
        tokenEUR,
      ]);
      expect(poolInfo).toBeTruthy();
      expect(poolInfo.reserveA).toBe(100000);
      expect(poolInfo.reserveB).toBe(90000);
    });
  });

  describe("Liquidity Management", () => {
    beforeEach(async () => {
      await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 100000, 90000],
        user1
      );
    });

    it("should add liquidity successfully", async () => {
      const result = await contract.callPublic(
        "add-liquidity",
        [tokenUSD, tokenEUR, 50000, 45000, 40000, 35000],
        user2
      );

      expect(result.isOk).toBe(true);
      expect(result.value).toBeGreaterThan(0);

      const poolInfo = await contract.callReadOnly("get-pool-info", [
        tokenUSD,
        tokenEUR,
      ]);
      expect(poolInfo.reserveA).toBe(150000);
      expect(poolInfo.reserveB).toBe(135000);
    });

    it("should reject add liquidity with high slippage", async () => {
      const result = await contract.callPublic(
        "add-liquidity",
        [tokenUSD, tokenEUR, 50000, 45000, 50000, 50000],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(103);
    });

    it("should reject add liquidity to non-existent pool", async () => {
      const result = await contract.callPublic(
        "add-liquidity",
        [tokenUSD, tokenGBP, 50000, 45000, 40000, 35000],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(105);
    });

    it("should remove liquidity successfully", async () => {
      const userLiquidity = await contract.callReadOnly("get-user-liquidity", [
        user1,
        tokenUSD,
        tokenEUR,
      ]);
      const liquidityToRemove = Math.floor(userLiquidity.shares / 2);

      const result = await contract.callPublic(
        "remove-liquidity",
        [tokenUSD, tokenEUR, liquidityToRemove, 10000, 9000],
        user1
      );

      expect(result.isOk).toBe(true);
      expect(result.value.amountA).toBeGreaterThan(0);
      expect(result.value.amountB).toBeGreaterThan(0);
    });

    it("should reject remove liquidity with insufficient balance", async () => {
      const userLiquidity = await contract.callReadOnly("get-user-liquidity", [
        user1,
        tokenUSD,
        tokenEUR,
      ]);
      const excessiveLiquidity = userLiquidity.shares + 1000;

      const result = await contract.callPublic(
        "remove-liquidity",
        [tokenUSD, tokenEUR, excessiveLiquidity, 0, 0],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(101);
    });

    it("should remove all liquidity and delete user record", async () => {
      const userLiquidity = await contract.callReadOnly("get-user-liquidity", [
        user1,
        tokenUSD,
        tokenEUR,
      ]);

      const result = await contract.callPublic(
        "remove-liquidity",
        [tokenUSD, tokenEUR, userLiquidity.shares, 0, 0],
        user1
      );

      expect(result.isOk).toBe(true);

      const updatedUserLiquidity = await contract.callReadOnly(
        "get-user-liquidity",
        [user1, tokenUSD, tokenEUR]
      );
      expect(updatedUserLiquidity).toBeNull();
    });
  });

  describe("Token Swapping", () => {
    beforeEach(async () => {
      await contract.callPublic(
        "create-pool",
        [tokenUSD, tokenEUR, 1000000, 900000],
        user1
      );
    });

    it("should swap exact tokens for tokens successfully", async () => {
      const amountIn = 10000;
      const expectedOut = await contract.callReadOnly("get-amount-out", [
        amountIn,
        tokenUSD,
        tokenEUR,
      ]);

      const result = await contract.callPublic(
        "swap-exact-tokens-for-tokens",
        [amountIn, expectedOut - 100, tokenUSD, tokenEUR],
        user2
      );

      expect(result.isOk).toBe(true);
      expect(result.value).toBe(expectedOut);

      const stats = await contract.callReadOnly("get-trading-stats", [
        tokenUSD,
        tokenEUR,
      ]);
      expect(stats.volume24h).toBe(amountIn);
      expect(stats.tradesCount).toBe(1);
    });

    it("should reject swap with zero amount", async () => {
      const result = await contract.callPublic(
        "swap-exact-tokens-for-tokens",
        [0, 100, tokenUSD, tokenEUR],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(106);
    });

    it("should reject swap with high slippage", async () => {
      const amountIn = 10000;
      const expectedOut = await contract.callReadOnly("get-amount-out", [
        amountIn,
        tokenUSD,
        tokenEUR,
      ]);

      const result = await contract.callPublic(
        "swap-exact-tokens-for-tokens",
        [amountIn, expectedOut + 1000, tokenUSD, tokenEUR],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(103);
    });

    it("should swap tokens for exact tokens successfully", async () => {
      const amountOut = 8000;
      const maxAmountIn = await contract.callReadOnly("get-amount-in", [
        amountOut,
        tokenUSD,
        tokenEUR,
      ]);

      const result = await contract.callPublic(
        "swap-tokens-for-exact-tokens",
        [amountOut, maxAmountIn + 100, tokenUSD, tokenEUR],
        user2
      );

      expect(result.isOk).toBe(true);
      expect(result.value).toBe(maxAmountIn);
    });

    it("should reject exact tokens swap with insufficient liquidity", async () => {
      const result = await contract.callPublic(
        "swap-tokens-for-exact-tokens",
        [900000, 2000000, tokenUSD, tokenEUR],
        user1
      );

      expect(result.isOk).toBe(false);
      expect(result.value).toBe(102);
    });
  });
});
