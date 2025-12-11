import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getMint, getTokenMetadata } from '@solana/spl-token';
import styles from '../styles/Terminal.module.css';
import idl from '../lib/idl.json';

const PROGRAM_ID = new PublicKey('8N2Vo6dFDUTPFz5waGuQfYFPZeS31ZeXgRcv3WqKptta'); // Updated Token-2022 compatible contract
// Updated to use Token-2022 - the modern Solana token standard
const ICO_MINT = new PublicKey('22idMWuXMNwqXZqv5oCjk52zSuqALyhxqQf7tgyzi2Hp');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const LAMPORTS_PER_TOKEN = 1_000_000;

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  const [icoData, setIcoData] = useState(null);
  const [buyAmount, setBuyAmount] = useState(1);
  const [depositAmount, setDepositAmount] = useState(100);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tokenMetadata, setTokenMetadata] = useState(null);
  const [userTokenBalance, setUserTokenBalance] = useState(0);
  const [solPrice, setSolPrice] = useState(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { message, type, timestamp }]);
  };

  useEffect(() => {
    setMounted(true);
    fetchTokenMetadata();
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchSolPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        if (data?.solana?.usd) {
          setSolPrice(data.solana.usd);
        }
      } catch (error) {
        console.error('Error fetching SOL price:', error);
      }
    };

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60_000);
    return () => clearInterval(interval);
  }, [mounted]);

  useEffect(() => {
    if (wallet.connected) {
      addLog(`> WALLET CONNECTED: ${wallet.publicKey.toString().slice(0, 8)}...`, 'success');
      fetchIcoData();
      fetchUserBalance();
    } else {
      addLog('> SYSTEM READY. AWAITING ID BADGE SCAN...', 'warning');
      setUserTokenBalance(0);
    }
  }, [wallet.connected]);

  const fetchUserBalance = async () => {
    if (!wallet.publicKey) return;

    try {
      const userAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const userAtaInfo = await connection.getAccountInfo(userAta);

      if (userAtaInfo) {
        // Parse token account data to get balance
        // Token account balance is at bytes 64-72 (u64)
        const rawBalance = new BN(userAtaInfo.data.slice(64, 72), 'le').toNumber();

        // Get decimals from token metadata or mint info
        const decimals = tokenMetadata?.decimals || 9;

        // Convert to human-readable amount
        const balance = rawBalance / Math.pow(10, decimals);

        setUserTokenBalance(balance);
        addLog(`> YOUR BALANCE: ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenMetadata?.symbol || 'tokens'}`, 'info');
      } else {
        setUserTokenBalance(0);
      }
    } catch (error) {
      console.error('Error fetching user balance:', error);
      setUserTokenBalance(0);
    }
  };

  const fetchTokenMetadata = async () => {
    try {
      addLog('> FETCHING TOKEN METADATA...', 'info');

      // Fetch token mint info with Token-2022 program
      const mintInfo = await getMint(connection, ICO_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);
      console.log('Mint Info:', mintInfo);

      try {
        // Get metadata from Token-2022 extensions (this is the correct way for Token-2022)
        const metadata = await getTokenMetadata(connection, ICO_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);

        if (metadata) {
          console.log('✅ Token Metadata found:', metadata);
          addLog(`> METADATA FOUND: ${metadata.name} (${metadata.symbol})`, 'success');

          // Fetch JSON metadata from URI if available
          if (metadata.uri) {
            try {
              addLog(`> LOADING IMAGE FROM: ${metadata.uri}`, 'info');
              const response = await fetch(metadata.uri);
              const jsonMetadata = await response.json();
              console.log('JSON Metadata:', jsonMetadata);

              setTokenMetadata({
                name: metadata.name || jsonMetadata.name || 'Token',
                symbol: metadata.symbol || jsonMetadata.symbol || 'TKN',
                decimals: mintInfo.decimals,
                uri: metadata.uri,
                image: jsonMetadata.image || '/token_icon.png',
              });

              addLog(`> TOKEN LOADED: ${metadata.name} (${metadata.symbol})`, 'success');
              return;
            } catch (uriError) {
              console.error('Error fetching URI metadata:', uriError);
              addLog(`> URI FETCH FAILED, USING ON-CHAIN DATA`, 'warning');

              // Use on-chain metadata even if URI fails
              setTokenMetadata({
                name: metadata.name || 'Token',
                symbol: metadata.symbol || 'TKN',
                decimals: mintInfo.decimals,
                uri: metadata.uri,
                image: '/token_icon.png',
              });

              addLog(`> ${metadata.name} (${metadata.symbol})`, 'success');
              return;
            }
          } else {
            // No URI, use metadata from extensions
            setTokenMetadata({
              name: metadata.name || 'Token',
              symbol: metadata.symbol || 'TKN',
              decimals: mintInfo.decimals,
              image: '/token_icon.png',
            });

            addLog(`> ${metadata.name} (${metadata.symbol})`, 'success');
            return;
          }
        }
      } catch (metadataError) {
        console.error('No Token-2022 metadata extension:', metadataError);
        addLog('> NO METADATA EXTENSION FOUND', 'warning');
      }

      // Fallback to default
      console.log('Using fallback metadata');
      setTokenMetadata({
        name: 'Token',
        symbol: 'TKN',
        decimals: mintInfo.decimals,
        image: '/token_icon.png',
      });

      addLog('> USING DEFAULT TOKEN INFO', 'warning');
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      addLog(`> METADATA ERROR: ${error.message}`, 'error');

      // Set default metadata
      setTokenMetadata({
        name: 'Token',
        symbol: 'TKN',
        decimals: 6,
        image: '/token_icon.png',
      });
    }
  };

  const getProvider = () => {
    if (!wallet.wallet) return null;
    return new AnchorProvider(
      connection,
      wallet,
      AnchorProvider.defaultOptions()
    );
  };

  const fetchIcoData = async () => {
    try {
      addLog('> ACCESSING ROBOT LOGBOOK...', 'info');
      const provider = getProvider();
      if (!provider) return;

      // Find all Data accounts for this program
      // We need to find the admin's Data PDA, not derive it from current wallet
      const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            dataSize: 9000, // The space we allocated for Data account
          },
        ],
      });

      if (programAccounts.length === 0) {
        // No data exists yet - show admin panel for initialization
        setIsAdmin(true);
        addLog('> LOGBOOK NOT FOUND. INITIALIZATION REQUIRED.', 'warning');
        addLog('> ADMIN MODE: You can initialize the ICO system.', 'admin');
        return;
      }

      // Get the first (and should be only) Data account
      const dataAccount = programAccounts[0];
      const accountInfo = dataAccount.account;

      if (accountInfo) {
        const totalTokens = new BN(accountInfo.data.slice(40, 48), 'le').toNumber();
        const tokensSold = new BN(accountInfo.data.slice(48, 56), 'le').toNumber();

        setIcoData({
          totalTokens,
          tokensSold,
          available: totalTokens - tokensSold
        });

        const adminPubkey = new PublicKey(accountInfo.data.slice(8, 40));
        const isUserAdmin = adminPubkey.equals(wallet.publicKey);
        setIsAdmin(isUserAdmin);

        addLog(`> LOGBOOK ACCESSED: ${totalTokens} TOTAL | ${tokensSold} SOLD | ${totalTokens - tokensSold} AVAILABLE`, 'success');

        if (isUserAdmin) {
          addLog('> ADMIN CREDENTIALS VERIFIED. SECRET MENU UNLOCKED.', 'admin');
        } else {
          addLog('> WELCOME, CUSTOMER. BROWSE AVAILABLE TOKENS.', 'success');
        }
      }
    } catch (error) {
      addLog(`> ERROR: ${error.message}`, 'error');
    }
  };

  const initializeICO = async () => {
    try {
      setLoading(true);
      addLog('> INITIALIZING ROBOT SYSTEM...', 'info');

      const provider = getProvider();
      const program = new Program(idl, PROGRAM_ID, provider);

      const [icoAtaForProgram] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        PROGRAM_ID
      );

      const [dataPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('data'), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      const adminAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const tx = await program.methods
        .createIcoAta(new BN(1000))
        .accounts({
          icoAtaForIcoProgram: icoAtaForProgram,
          data: dataPDA,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminAta,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      addLog(`> INITIALIZATION COMPLETE. TX: ${tx.slice(0, 8)}...`, 'success');
      await fetchIcoData();
    } catch (error) {
      addLog(`> INITIALIZATION FAILED: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const depositTokens = async () => {
    try {
      setLoading(true);
      addLog(`> RESTOCKING ${depositAmount} TOKENS...`, 'info');

      const provider = getProvider();
      const program = new Program(idl, PROGRAM_ID, provider);

      const [icoAtaForProgram] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        PROGRAM_ID
      );

      const [dataPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('data'), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      const adminAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const tx = await program.methods
        .depositeIcoInAta(new BN(depositAmount))
        .accounts({
          icoAtaForIcoProgram: icoAtaForProgram,
          data: dataPDA,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminAta,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      addLog(`> RESTOCK COMPLETE. TX: ${tx.slice(0, 8)}...`, 'success');
      await fetchIcoData();
      await fetchUserBalance(); // Refresh admin balance
    } catch (error) {
      if (error.message.includes('insufficient funds')) {
        addLog(`> RESTOCK FAILED: You don't have enough ${tokenMetadata?.symbol || 'tokens'} in your wallet!`, 'error');
        addLog(`> Your balance: ${userTokenBalance.toLocaleString()} | Trying to deposit: ${depositAmount.toLocaleString()}`, 'error');
      } else {
        addLog(`> RESTOCK FAILED: ${error.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const buyTokens = async () => {
    try {
      setLoading(true);
      const cost = (buyAmount * LAMPORTS_PER_TOKEN) / 1_000_000;
      addLog(`> PROCESSING PURCHASE: ${buyAmount} TOKENS FOR ${cost} SOL...`, 'info');

      const provider = getProvider();
      const program = new Program(idl, PROGRAM_ID, provider);

      const [icoAtaForProgram, bump] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        PROGRAM_ID
      );

      // Find the admin's Data PDA (same as in fetchIcoData)
      const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            dataSize: 9000,
          },
        ],
      });

      if (programAccounts.length === 0) {
        addLog('> ERROR: ICO not initialized', 'error');
        setLoading(false);
        return;
      }

      const dataPDA = programAccounts[0].pubkey;
      const accountInfo = programAccounts[0].account;

      const userAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Check if user's ATA exists, if not create it
      const userAtaInfo = await connection.getAccountInfo(userAta);
      if (!userAtaInfo) {
        addLog('> CREATING YOUR TOKEN ACCOUNT...', 'info');

        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          userAta, // ata
          wallet.publicKey, // owner
          ICO_MINT, // mint
          TOKEN_2022_PROGRAM_ID // token program
        );

        const transaction = new Transaction().add(createAtaIx);
        const signature = await wallet.sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'confirmed');

        addLog('> TOKEN ACCOUNT CREATED SUCCESSFULLY', 'success');
      }

      const adminPubkey = new PublicKey(accountInfo.data.slice(8, 40));

      const tx = await program.methods
        .buyTokens(bump, new BN(buyAmount))
        .accounts({
          icoAtaForIcoProgram: icoAtaForProgram,
          data: dataPDA,
          icoMint: ICO_MINT,
          icoAtaForUser: userAta,
          user: wallet.publicKey,
          admin: adminPubkey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      addLog(`> PURCHASE COMPLETE! TX: ${tx.slice(0, 8)}...`, 'success');
      addLog(`> ${buyAmount} TOKENS DISPENSED TO YOUR ACCOUNT`, 'success');
      await fetchIcoData();
      await fetchUserBalance(); // Refresh balance
    } catch (error) {
      addLog(`> PURCHASE FAILED: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const progressPercent = icoData
    ? ((icoData.totalTokens - icoData.tokensSold) / icoData.totalTokens) * 100
    : 0;

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    return (
      <div className={styles.container}>
        <div className={styles.terminal}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.dot} style={{ background: '#ff5f56' }}></span>
              <span className={styles.dot} style={{ background: '#ffbd2e' }}></span>
              <span className={styles.dot} style={{ background: '#27c93f' }}></span>
            </div>
            <div className={styles.headerTitle}>BLOCKCHAIN ROBOT CONTROL TERMINAL v2.0</div>
          </div>
          <div className={styles.asciiArt}>
            <pre>{`
    ╔═══════════════════════════════════════════════════════════════╗
    ║                  SOLANA ICO VENDING ROBOT                     ║
    ║                                                               ║
    ║              ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄▄▄           ║
    ║             ▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌▐░░░░░░░░░░░▌          ║
    ║              ▀▀▀▀█░█▀▀▀▀ ▐░█▀▀▀▀▀▀▀█░▌▐░█▀▀▀▀▀▀▀█░▌          ║
    ║                 ▐░▌     ▐░▌       ▐░▌▐░▌       ▐░▌          ║
    ║                 ▐░▌     ▐░▌       ▐░▌▐░▌       ▐░▌          ║
    ║                 ▐░▌     ▐░▌       ▐░▌▐░▌       ▐░▌          ║
    ║                 ▐░▌     ▐░█▄▄▄▄▄▄▄█░▌▐░▌       ▐░▌          ║
    ║                 ▐░▌     ▐░░░░░░░░░░░▌▐░▌       ▐░▌          ║
    ║                  ▀       ▀▀▀▀▀▀▀▀▀▀▀  ▀         ▀           ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
          `}</pre>
          </div>
          <div className={styles.content}>
            <div className={styles.storyBox}>
              <div className={styles.storyTitle}>
                <span className="blink">▶</span> SYSTEM NARRATIVE
              </div>
              <div className={styles.storyText}>
                <p className="pulse">&gt; Initializing system...</p>
              </div>
            </div>
          </div>
          <div className={styles.footer}>
            <span className="blink">█</span> BLOCKCHAIN ROBOT OS v2.0 | POWERED BY SOLANA | STATUS: INITIALIZING
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.terminal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.dot} style={{ background: '#ff5f56' }}></span>
            <span className={styles.dot} style={{ background: '#ffbd2e' }}></span>
            <span className={styles.dot} style={{ background: '#27c93f' }}></span>
          </div>
          <div className={styles.headerTitle}>BLOCKCHAIN ROBOT CONTROL TERMINAL v2.0</div>
          <div className={styles.headerRight}>
            <WalletMultiButton className={styles.walletButton} />
          </div>
        </div>

        <div className={styles.mobileWallet}>
          <WalletMultiButton className={styles.walletButton} />
        </div>

        <div className={styles.content}>
          <div className={styles.leftPanel}>
            <div className={styles.panelSection}>
              <div className={styles.walletRow}>
                <div>
                  <div className={styles.subLabel}>WALLET STATUS</div>
                  <div className={styles.statusText}>
                    {wallet.connected
                      ? `${wallet.publicKey.toString().slice(0, 8)}... connected`
                      : 'Not connected'}
                  </div>
                </div>
                {!wallet.connected && (
                  <div className={styles.helperPill}>Connect to unlock controls</div>
                )}
              </div>

              {wallet.connected && (
                <div className={styles.balanceCard}>
                  <div className={styles.balanceLabel}>YOUR BALANCE</div>
                  <div className={styles.balanceValue}>
                    {userTokenBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    {tokenMetadata?.symbol || 'TOKENS'}
                  </div>
                </div>
              )}
            </div>

            <div className={`${styles.panelSection} ${styles.splitRow}`}>
              <div className={styles.robotSection}>
                <div className={styles.robotDisplay}>
                  <img
                    src="/robot_vending_machine.png"
                    alt="Token Vending Robot"
                    className={styles.robotImage}
                  />
                  <div className={styles.robotFace}>
                    <img src="/robot_face_icon.png" alt="Robot Face" />
                  </div>
                </div>

                <div className={styles.tokenBadge}>
                  {tokenMetadata?.image && (
                    <img
                      src={tokenMetadata.image}
                      alt={tokenMetadata.symbol}
                      className={styles.tokenImage}
                    />
                  )}
                  <div className={styles.tokenName}>
                    {tokenMetadata?.name || 'SPARK TOKEN'}
                  </div>
                </div>
              </div>

              <div className={styles.vendingMachine}>
                <div className={styles.machineTitle}>
                  TOKEN DISPENSER
                </div>

                <div className={styles.storyBox}>
                  <div className={styles.storyText}>
                    {!wallet.connected ? (
                      <>
                        <p>&gt; Welcome to the Token Vending Robot.</p>
                        <p>&gt; Scan your DIGITAL ID BADGE to begin.</p>
                        <p className="pulse">&gt; Awaiting identification...</p>
                      </>
                    ) : !icoData ? (
                      <>
                        <p>&gt; ID: {wallet.publicKey.toString().slice(0, 12)}...</p>
                        <p className="text-warning">&gt; System not initialized.</p>
                        <p>&gt; Admin must power on first.</p>
                      </>
                    ) : (
                      <>
                        <p>&gt; Welcome back, Customer!</p>
                        <p>&gt; Robot is ready to dispense tokens.</p>
                        <p>&gt; {icoData.available.toLocaleString()} tokens available.</p>
                        {isAdmin && <p className="text-info">&gt; ADMIN MODE ACTIVE</p>}
                      </>
                    )}
                  </div>
                </div>

                {wallet.connected && icoData && icoData.available > 0 && !isAdmin && (
                  <div className={styles.buySection}>
                    <h3>🪙 BUY TOKENS</h3>
                    <div className={styles.inputGroup}>
                      <label>Quantity (Cost: 0.001 SOL per token)</label>
                      <input
                        type="number"
                        min="1"
                        max={Math.min(1000, icoData.available)}
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className={styles.costHelper}>
                      Total Cost: {(buyAmount * 0.001).toFixed(3)} SOL
                    </div>
                    <button
                      className={styles.buyButton}
                      onClick={buyTokens}
                      disabled={loading || buyAmount > icoData.available}
                    >
                      {loading ? '⏳ PROCESSING...' : `🚀 BUY ${buyAmount} TOKENS`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.rightPanel}>
            {icoData && (
              <div className={`${styles.card} ${styles.inventoryBox}`}>
                <div className={styles.sectionTitle}>
                  <span className="blink">▶</span> LIVE INVENTORY SCANNER
                </div>
                <div className={styles.inventoryGrid}>
                  <div className={styles.statBox}>
                    <div className={styles.statLabel}>TOTAL CAPACITY</div>
                    <div className={styles.statValue}>{icoData.totalTokens.toLocaleString()}</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statLabel}>TOKENS SOLD</div>
                    <div className={styles.statValue}>{icoData.tokensSold.toLocaleString()}</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statLabel}>AVAILABLE NOW</div>
                    <div className={styles.statValue + ' pulse'}>{icoData.available.toLocaleString()}</div>
                  </div>
                </div>

                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progressPercent}%` }}>
                    <span className={styles.progressText}>{progressPercent.toFixed(1)}% IN STOCK</span>
                  </div>
                </div>
              </div>
            )}

            {wallet.connected && isAdmin && (
              <div className={`${styles.card} ${styles.adminBox}`}>
                <div className={styles.sectionTitle}>
                  <span className="blink">▶</span> ADMIN CONTROL PANEL [RESTRICTED]
                </div>
                <div className={styles.adminContent}>
                  <div className={styles.adminStory}>
                    <p className="text-info">&gt; Manager credentials verified.</p>
                    <p>&gt; Maintenance functions unlocked.</p>
                  </div>

                  {!icoData ? (
                    <div className={styles.adminAction}>
                      <p className="text-warning">&gt; System not initialized. Power on below.</p>
                      <button
                        onClick={initializeICO}
                        disabled={loading}
                        className={styles.btnAdmin}
                      >
                        {loading ? '> INITIALIZING...' : '> INITIALIZE ROBOT SYSTEM'}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.adminAction}>
                      <label className={styles.inputLabel}>
                        RESTOCK AMOUNT:
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(parseInt(e.target.value))}
                          className={styles.input}
                          min="1"
                        />
                      </label>
                      <button
                        onClick={depositTokens}
                        disabled={loading}
                        className={styles.btnAdmin}
                      >
                        {loading ? '> RESTOCKING...' : `> DEPOSIT ${depositAmount} TOKENS`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={`${styles.card} ${styles.logsBox}`}>
              <div className={styles.sectionTitle}>
                <span className="blink">▶</span> SYSTEM LOGS
              </div>
              <div className={styles.logsContent}>
                {logs.map((log, i) => (
                  <div key={i} className={`${styles.logEntry} ${styles['log-' + log.type]}`}>
                    <span className={styles.logTime}>[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerText}>
            <span className="blink">█</span> BLOCKCHAIN ROBOT OS v2.0 | POWERED BY SOLANA | STATUS: OPERATIONAL | SOL: {solPrice ? solPrice.toFixed(2) : '--.--'} USD
          </span>
        </div>
      </div>
    </div>
  );
}
