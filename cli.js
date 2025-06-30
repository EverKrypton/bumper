const EthBumperSDK = require('./sdk');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000/api';
const sdk = new EthBumperSDK(SERVER_URL);

yargs(hideBin(process.argv))
    .command('create <tokenAddress>', 'Create a new bump order', (yargs) => {
        yargs
            .positional('tokenAddress', {
                describe: 'The address of the ERC-20 token to bump',
                type: 'string'
            });
    },
        async (argv) => {
            try {
                const result = await sdk.createBumpOrder(argv.tokenAddress);
                console.log('\n🎯 Bump Order Created Successfully!');
                console.log('=====================================');
                console.log(`Order ID: ${result.orderId}`);
                console.log(`Deposit Wallet: ${result.depositWallet}`);
                console.log(`Token Address: ${argv.tokenAddress}`);
                console.log('\n💰 Next Steps:');
                console.log('1. Send ETH to the deposit wallet address above');
                console.log('2. Run: node index.js start <orderId> to begin bumping');
                console.log('3. Monitor with: node index.js status <orderId>');
                console.log('\n⚠️  Note: 0.009 ETH will be deducted as treasury fee');
            } catch (error) {
                console.error('❌ Error creating bump order:', error.message);
            }
        }
    )
    .command('start <orderId>', 'Start processing a bump order', (yargs) => {
        yargs
            .positional('orderId', {
                describe: 'The order ID to start processing',
                type: 'string'
            });
    },
        async (argv) => {
            try {
                const result = await sdk.startBumpOrder(argv.orderId);
                console.log('\n🚀 Bump Order Processing Started!');
                console.log('===================================');
                console.log(`Order ID: ${argv.orderId}`);
                console.log(`Total Batches: ${result.totalBatches}`);
                console.log(`Estimated Bumps: ${result.estimatedBumps}`);
                console.log('\n📊 The order is now being processed in the background.');
                console.log('Use "node index.js status <orderId>" to monitor progress.');
            } catch (error) {
                console.error('❌ Error starting bump order:', error.message);
            }
        }
    )
    .command('status <orderId>', 'Check order status', (yargs) => {
        yargs
            .positional('orderId', {
                describe: 'The order ID to check',
                type: 'string'
            });
    },
        async (argv) => {
            try {
                const status = await sdk.getOrderStatus(argv.orderId);
                console.log('\n📋 Order Status');
                console.log('================');
                console.log(`Order ID: ${status.orderId}`);
                console.log(`Status: ${getStatusEmoji(status.status)} ${status.status.toUpperCase()}`);
                console.log(`Token Address: ${status.tokenAddress}`);
                console.log(`Deposit Wallet: ${status.depositWallet}`);
                console.log(`Current Balance: ${status.currentBalance} ETH`);
                
                if (status.status === 'processing' || status.status === 'completed') {
                    console.log(`Total Amount: ${status.totalAmount} ETH`);
                    console.log(`Remaining Amount: ${status.remainingAmount} ETH`);
                    console.log(`Progress: ${status.currentBatch}/${status.totalBatches} batches`);
                    
                    if (status.totalBatches > 0) {
                        const progress = (status.currentBatch / status.totalBatches * 100).toFixed(1);
                        console.log(`Completion: ${progress}%`);
                    }
                }
                
                console.log(`Created: ${new Date(status.createdAt).toLocaleString()}`);
                if (status.completedAt) {
                    console.log(`Completed: ${new Date(status.completedAt).toLocaleString()}`);
                }
            } catch (error) {
                console.error('❌ Error checking order status:', error.message);
            }
        }
    )
    .command('monitor <orderId>', 'Monitor order progress in real-time', (yargs) => {
        yargs
            .positional('orderId', {
                describe: 'The order ID to monitor',
                type: 'string'
            });
    },
        async (argv) => {
            console.log(`🔍 Monitoring order ${argv.orderId}...`);
            console.log('Press Ctrl+C to stop monitoring\n');
            
            const stopMonitoring = sdk.monitorOrder(argv.orderId, (error, status) => {
                if (error) {
                    console.error('❌ Error monitoring order:', error.message);
                    return;
                }
                
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] ${getStatusEmoji(status.status)} ${status.status.toUpperCase()}`);
                
                if (status.status === 'processing') {
                    const progress = status.totalBatches > 0 
                        ? (status.currentBatch / status.totalBatches * 100).toFixed(1)
                        : '0.0';
                    console.log(`           Progress: ${status.currentBatch}/${status.totalBatches} batches (${progress}%)`);
                    console.log(`           Balance: ${status.currentBalance} ETH`);
                }
                
                if (status.status === 'completed') {
                    console.log('🎉 Order completed successfully!');
                    process.exit(0);
                } else if (status.status === 'failed') {
                    console.log('💥 Order failed!');
                    process.exit(1);
                }
            });
            
            // Handle graceful shutdown
            process.on('SIGINT', () => {
                console.log('\n👋 Stopping monitoring...');
                stopMonitoring();
                process.exit(0);
            });
        }
    )
    .command('list', 'List all orders', () => {},
        async (argv) => {
            try {
                const orders = await sdk.getAllOrders();
                
                if (orders.length === 0) {
                    console.log('📭 No orders found.');
                    return;
                }
                
                console.log('\n📋 All Orders');
                console.log('=============');
                
                orders.forEach((order, index) => {
                    console.log(`\n${index + 1}. Order ID: ${order.orderId}`);
                    console.log(`   Status: ${getStatusEmoji(order.status)} ${order.status.toUpperCase()}`);
                    console.log(`   Token: ${order.tokenAddress}`);
                    console.log(`   Created: ${new Date(order.createdAt).toLocaleString()}`);
                    
                    if (order.status === 'processing' || order.status === 'completed') {
                        const progress = order.totalBatches > 0 
                            ? (order.currentBatch / order.totalBatches * 100).toFixed(1)
                            : '0.0';
                        console.log(`   Progress: ${order.currentBatch}/${order.totalBatches} batches (${progress}%)`);
                    }
                });
            } catch (error) {
                console.error('❌ Error listing orders:', error.message);
            }
        }
    )
    .command('health', 'Check API health', () => {},
        async (argv) => {
            try {
                const health = await sdk.checkHealth();
                console.log('✅ API is healthy');
                console.log(`Timestamp: ${health.timestamp}`);
            } catch (error) {
                console.error('❌ API health check failed:', error.message);
            }
        }
    )
    .demandCommand()
    .help()
    .argv;

function getStatusEmoji(status) {
    const emojis = {
        'pending': '⏳',
        'processing': '🔄',
        'completed': '✅',
        'failed': '❌'
    };
    return emojis[status] || '❓';
}
