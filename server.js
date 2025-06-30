require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Ethereum setup
const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
const treasuryAddress = process.env.TREASURY_ADDRESS;

// Uniswap V2 Router
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const UNISWAP_V2_ABI = [
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function WETH() external pure returns (address)',
    'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const UNISWAP_V2_PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
];

// Uniswap V3 Router
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNISWAP_V3_ABI = [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

const DISPERSER_ABI = [
    'function disperseEth(address payable[] calldata recipients, uint256[] calldata values) external payable'
];

const disperserContract = new ethers.Contract(process.env.DISPERSER_CONTRACT_ADDRESS, DISPERSER_ABI, provider);

// Bump Order Schema
const bumpOrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    depositWallet: { type: String, required: true },
    privateKey: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    totalAmount: { type: String, required: true },
    remainingAmount: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    currentBatch: { type: Number, default: 0 },
    totalBatches: { type: Number, default: 0 }
});

const BumpOrder = mongoose.model('BumpOrder', bumpOrderSchema);

// Wallet Batch Schema
const walletBatchSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    batchNumber: { type: Number, required: true },
    wallets: [{
        address: String,
        privateKey: String,
        used: { type: Boolean, default: false }
    }],
    status: { type: String, enum: ['created', 'funded', 'executed', 'completed'], default: 'created' }
});

const WalletBatch = mongoose.model('WalletBatch', walletBatchSchema);

// Utility Functions
function generateWalletBatch(count = 5) {
    const wallets = [];
    for (let i = 0; i < count; i++) {
        const wallet = ethers.Wallet.createRandom();
        wallets.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            used: false
        });
    }
    return wallets;
}

async function getTokenPrice(tokenAddress) {
    try {
        const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
        const uniswapV2Router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_V2_ABI, provider);

        const pairAddress = await uniswapV2Router.getPair(tokenAddress, wethAddress);

        if (pairAddress === ethers.constants.AddressZero) {
            return false; // Pair doesn't exist
        }

        const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider);
        const reserves = await pairContract.getReserves();
        const token0 = await pairContract.token0();

        const [reserveToken, reserveWETH] = token0.toLowerCase() === tokenAddress.toLowerCase() 
            ? [reserves[0], reserves[1]] 
            : [reserves[1], reserves[0]];

        if (reserveToken.isZero() || reserveWETH.isZero()) {
            return false; // No liquidity
        }

        return true; // Token has a price/liquidity
    } catch (error) {
        console.error('Error checking token price:', error);
        return false;
    }
}

async function fundWalletsWithDisperser(fromWallet, wallets, bumpAmount, gasBuffer) {
    const recipients = wallets.map(w => w.address);
    const values = wallets.map(() => bumpAmount.add(gasBuffer));
    const totalAmount = values.reduce((acc, v) => acc.add(v), ethers.BigNumber.from(0));

    try {
        const tx = await disperserContract.connect(fromWallet).disperseEth(recipients, values, { value: totalAmount });
        await tx.wait();
        return tx.hash;
    } catch (error) {
        console.error('Error funding wallets with disperser:', error);
        throw error;
    }
}

async function sendEthToWallet(fromWallet, toAddress, amount) {
    try {
        const tx = await fromWallet.sendTransaction({
            to: toAddress,
            value: amount,
            gasLimit: 21000,
            gasPrice: await provider.getGasPrice()
        });
        await tx.wait();
        return tx.hash;
    } catch (error) {
        console.error('Error sending ETH:', error);
        throw error;
    }
}

async function swapETHForTokensV2(wallet, tokenAddress, ethAmount, recipient) {
    try {
        const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_V2_ABI, wallet);
        const wethAddress = await router.WETH();
        
        const path = [wethAddress, tokenAddress];
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
        
        const tx = await router.swapExactETHForTokens(
            0, // amountOutMin - accept any amount
            path,
            recipient,
            deadline,
            {
                value: ethAmount,
                gasLimit: 300000,
                gasPrice: await provider.getGasPrice()
            }
        );
        
        await tx.wait();
        return tx.hash;
    } catch (error) {
        console.error('Error swapping ETH for tokens (V2):', error);
        throw error;
    }
}

async function swapETHForTokensV3(wallet, tokenAddress, ethAmount, recipient) {
    try {
        const router = new ethers.Contract(UNISWAP_V3_ROUTER, UNISWAP_V3_ABI, wallet);
        const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
        
        const params = {
            tokenIn: wethAddress,
            tokenOut: tokenAddress,
            fee: 3000, // 0.3% fee tier
            recipient: recipient,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            amountIn: ethAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };
        
        const tx = await router.exactInputSingle(params, {
            value: ethAmount,
            gasLimit: 300000,
            gasPrice: await provider.getGasPrice()
        });
        
        await tx.wait();
        return tx.hash;
    } catch (error) {
        console.error('Error swapping ETH for tokens (V3):', error);
        // Fallback to V2 if V3 fails
        return await swapETHForTokensV2(wallet, tokenAddress, ethAmount, recipient);
    }
}

// API Routes

// Create new bump order
app.post('/api/bump/create', async (req, res) => {
    try {
        const { tokenAddress } = req.body;
        
        if (!tokenAddress || !ethers.utils.isAddress(tokenAddress)) {
            return res.status(400).json({ error: 'Valid token address is required' });
        }
        
        // Validate token exists
        const tokenExists = await getTokenPrice(tokenAddress);
        if (!tokenExists) {
            return res.status(400).json({ error: 'Token not found or not tradeable' });
        }
        
        // Generate deposit wallet
        const depositWallet = ethers.Wallet.createRandom();
        const orderId = uuidv4();
        
        // Create bump order
        const bumpOrder = new BumpOrder({
            orderId,
            depositWallet: depositWallet.address,
            privateKey: depositWallet.privateKey,
            tokenAddress,
            totalAmount: '0',
            remainingAmount: '0',
            status: 'pending'
        });
        
        await bumpOrder.save();
        
        res.json({
            orderId,
            depositWallet: depositWallet.address,
            message: 'Deposit ETH to this wallet to start bumping'
        });
        
    } catch (error) {
        console.error('Error creating bump order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check order status
app.get('/api/bump/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await BumpOrder.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Check wallet balance
        const wallet = new ethers.Wallet(order.privateKey, provider);
        const balance = await wallet.getBalance();
        
        res.json({
            orderId: order.orderId,
            status: order.status,
            tokenAddress: order.tokenAddress,
            depositWallet: order.depositWallet,
            currentBalance: ethers.utils.formatEther(balance),
            totalAmount: order.totalAmount,
            remainingAmount: order.remainingAmount,
            currentBatch: order.currentBatch,
            totalBatches: order.totalBatches,
            createdAt: order.createdAt,
            completedAt: order.completedAt
        });
        
    } catch (error) {
        console.error('Error checking order status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Process bump orders (this should be called by a cron job or worker)
app.post('/api/bump/process/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await BumpOrder.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status !== 'pending') {
            return res.status(400).json({ error: 'Order is not in pending status' });
        }
        
        // Check wallet balance
        const depositWallet = new ethers.Wallet(order.privateKey, provider);
        const balance = await depositWallet.getBalance();
        
        if (balance.lt(ethers.utils.parseEther('0.01'))) {
            return res.status(400).json({ error: 'Insufficient balance. Minimum 0.01 ETH required' });
        }
        
        // Calculate treasury fee (0.009 ETH) and remaining amount
        const treasuryFee = ethers.utils.parseEther('0.009');
        const remainingAmount = balance.sub(treasuryFee);
        
        if (remainingAmount.lte(0)) {
            return res.status(400).json({ error: 'Insufficient balance after treasury fee' });
        }
        
        // Send treasury fee
        await sendEthToWallet(depositWallet, treasuryAddress, treasuryFee);
        
        // Update order
        order.totalAmount = ethers.utils.formatEther(balance);
        order.remainingAmount = ethers.utils.formatEther(remainingAmount);
        order.status = 'processing';
        
        // Calculate total batches needed (each batch uses 5 wallets * BUMP_AMOUNT_ETH)
        const bumpAmount = ethers.utils.parseEther(process.env.BUMP_AMOUNT_ETH); // This is the ETH input for each swap. Be aware of token transfer fees.
        const batchSize = 5;
        const totalBumps = Math.floor(remainingAmount.div(bumpAmount).toNumber());
        const totalBatches = Math.ceil(totalBumps / batchSize);
        
        order.totalBatches = totalBatches;
        await order.save();
        
        // Start processing in background
        processBumpOrder(orderId);
        
        res.json({
            message: 'Bump order processing started',
            orderId,
            totalBatches,
            estimatedBumps: totalBumps
        });
        
    } catch (error) {
        console.error('Error processing bump order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Background processing function
async function processBumpOrder(orderId) {
    try {
        const order = await BumpOrder.findOne({ orderId });
        if (!order || order.status !== 'processing') return;
        
        const depositWallet = new ethers.Wallet(order.privateKey, provider);
        const bumpAmount = ethers.utils.parseEther(process.env.BUMP_AMOUNT_ETH);
        const gasBuffer = ethers.utils.parseEther('0.0001'); // Gas buffer per wallet
        const batchSize = 5;
        
        let currentBatch = order.currentBatch;
        
        while (currentBatch < order.totalBatches) {
            try {
                // Check remaining balance
                const balance = await depositWallet.getBalance();
                const requiredAmount = bumpAmount.mul(batchSize).add(gasBuffer.mul(batchSize));
                
                if (balance.lt(requiredAmount)) {
                    console.log(`Insufficient balance for batch ${currentBatch + 1}. Stopping.`);
                    break;
                }
                
                // Generate wallet batch
                const wallets = generateWalletBatch(batchSize);
                
                // Save wallet batch
                const walletBatch = new WalletBatch({
                    orderId,
                    batchNumber: currentBatch + 1,
                    wallets,
                    status: 'created'
                });
                await walletBatch.save();
                
                // Fund wallets using the disperser
                await fundWalletsWithDisperser(depositWallet, wallets, bumpAmount, gasBuffer);
                
                walletBatch.status = 'funded';
                await walletBatch.save();
                
                // Execute swaps
                const swapPromises = wallets.map(async (walletInfo, index) => {
                    try {
                        const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
                        
                        // Random delay between 0-5 seconds
                        await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));
                        
                        // Try V3 first, fallback to V2
                        const txHash = await swapETHForTokensV3(
                            wallet,
                            order.tokenAddress,
                            bumpAmount,
                            wallet.address
                        );
                        
                        console.log(`Swap ${index + 1} completed: ${txHash}`);
                        return txHash;
                    } catch (error) {
                        console.error(`Swap ${index + 1} failed:`, error);
                        return null;
                    }
                });
                
                await Promise.all(swapPromises);
                
                walletBatch.status = 'completed';
                await walletBatch.save();
                
                currentBatch++;
                order.currentBatch = currentBatch;
                await order.save();
                
                console.log(`Batch ${currentBatch} completed for order ${orderId}`);
                
                // Wait before next batch
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
                
            } catch (error) {
                console.error(`Error processing batch ${currentBatch + 1}:`, error);
                break;
            }
        }
        
        // Update order status
        order.status = 'completed';
        order.completedAt = new Date();
        await order.save();
        
        console.log(`Order ${orderId} completed`);
        
    } catch (error) {
        console.error('Error in processBumpOrder:', error);
        
        // Update order status to failed
        await BumpOrder.updateOne(
            { orderId },
            { status: 'failed' }
        );
    }
}

// Get all orders
app.get('/api/bump/orders', async (req, res) => {
    try {
        const orders = await BumpOrder.find({})
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(port, () => {
    console.log(`ETH Bumper API server listening at http://localhost:${port}`);
    console.log('Treasury wallet address:', treasuryAddress);
});

module.exports = app;
