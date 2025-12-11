const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint, unpackMint, ExtensionType, getMetadataPointerState, getTokenMetadata } = require('@solana/spl-token');

const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ICO_MINT = new PublicKey('22idMWuXMNwqXZqv5oCjk52zSuqALyhxqQf7tgyzi2Hp');

async function fetchMetadata() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    try {
        // Get the account info
        const accountInfo = await connection.getAccountInfo(ICO_MINT);

        if (accountInfo) {
            console.log('Account found, parsing Token-2022 extensions...');

            try {
                // Try to get metadata from Token-2022 extensions
                const metadata = await getTokenMetadata(connection, ICO_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);

                if (metadata) {
                    console.log('✅ Token Metadata found in extensions!');
                    console.log('Name:', metadata.name);
                    console.log('Symbol:', metadata.symbol);
                    console.log('URI:', metadata.uri);
                    console.log('Full metadata:', metadata);

                    if (metadata.uri) {
                        try {
                            const response = await fetch(metadata.uri);
                            const json = await response.json();
                            console.log('JSON Metadata from URI:', json);
                        } catch (e) {
                            console.log('Could not fetch URI:', e.message);
                        }
                    }
                }
            } catch (extError) {
                console.log('No metadata extension found:', extError.message);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

fetchMetadata();
