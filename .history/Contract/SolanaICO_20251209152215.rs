use anchor_lang::prelude::*;
use anchor_spl::token::{self,Mint,Token,TokenAccount}; //use is import in Rust

declare_id!("program_id") // it will generate automatically in Solona playground



#[error_code]
pub enum ErrorCode{
    #[msg("Arithmetic overflow occurred")]
    Overflow,
    #[msg("Invalid Admin")]
    InvalidAdmin,
    #[msg("Insufficient Funds")]
    InsufficientFunds,
}
 // ATA means Associated Token Account. In Solana, We don't hold tokens in your wallet directly. We hold them in a sub-account called an ATA

#[program]
pub mod ico{

    pub const ICO_MINT_ADDRESS: &str ="";
    pub const LAMPORTS_PER_TOKEN: u64 = 1_000_000; //.001 SOL i lamports
    pub const TOKEN_DECIMALS: u64 = 1_000_000_000; // 10^9 for SPL token decimals
    
    use super::*; //inherit from the outer scope

    //setting up the ICO by creating an ATA for the program to hold ICO tokens
    pub fn create_ico_ata(ctx: Context<CreateIcoATA>,ico_amount:u64 -> Result<()>{

        msg!("Creating Program ATA to hold ICO tokens");

        //Convert amount to token decimals
        let raw_amount = ico_amount
            .checked_mul(TOKEN_DECIMALS)
            .ok_or(ErrorCode::Overflow)?;

        let cross_program_invocation_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(), 
            // asking token program to do the transfer
            token::Transfer{ 
                from: ctx.accounts.ico_ata_for_admin.to_account_info(), // from admin account
                to: ctx.accounts.ico_ata_for_ico_program.to_account_info(), // to  the contract account
                authority: ctx.accounts.admin.to_account_info(), //signed by admin
            }
        );

        token::transfer(cross_program_invocation_context,raw_amount)?;
        msg!("Transferred {} ICO tokens to Program ATA", ico_amount);
        

        // its a logbook of the contract , that contains admin address , total tokens and tokens sold
        let data =&mut ctx.accounts.data;
        data.admin=*ctx.accounts.admin.key;
        data.total_tokens = ico_amount;
        data.tokens_sold = 0;
        msg!("Initialized ICO data");
        Ok(())
    }


    // function to deposit additional ICO tokens to the program ATA
    pub fn deposite_ico_in_ata(ctx: Context<DepositeIcoATA>,ico_amount: u64)->
    Result<()>{


        //
        if ctx.accounts.data.admin != *ctx.accounts.admin.key{
            return Err(error!(ErrorCode::InvalidAdmin));
        }

        //Convert amount to token decimals
        let raw_amount = ico_amount
            .checked_mul(TOKEN_DECIMALS)
            .ok_or(ErrorCode::Overflow)?;

        let cross_program_invocation_context = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer{
                from: ctx.accounts.ico_ata_for_admin.to_account_info(),
                to: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            }
        )

        token::transfer(cross_program_invocation_context,raw_amount)?;

        let data =&mut ctx.accounts.data;
        data.total_tokens += ico_amount;
    
        msg!("Deposited {} Additional ICO tokens to Program ATA", ico_amount);
        Ok(())

    }

    // function to buy tokens from the ICO
    pub fn buy_tokens(ctx:Context<BuyTokens>, _ico_ico_ata_for_ico_program_bump: u8, token_amount: u64,)
    -> Result<()> {

          //Convert token amount to include decimals for SPL transfer
        let raw_amount = token_amount
            .checked_mul(TOKEN_DECIMALS)
            .ok_or(ErrorCode::Overflow)?;

        // calculation SOL const (0.001 sol per token)   
        let raw_amount = token_amount
            .checked_mul(LAMPORTS_PER_TOKEN)
            .ok_or(ErrorCode::Overflow)?;


         //   taking salona from user to admin
        let ix = anchor_lang::solana_program::system_instruction::transfer(

            &ctx.account.users.key(), // ctx means context which actually stand here from user public key , its a short from
            &ctx.account.admin.key(), // here means to admin(owner) public key
            sol_amount,
        );

        anchor_lang::soloana_program::program::invoke(
            &ix, // previous user instruction's reference
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.admin.to_account_info(),
            ],
        )?; 

        msg!("Transferred {} lamports to admin", sol_amount);
        
        //Transfer TOKENS to user                                           
       let ico_mint_address = ctx.accounts.ico_mint.key();

       iet seeds = &[ico_mint_address.as_ref(),

       &[_ico_ico_ata_for_ico_program_bump]]; // A bump is a tiny number (0-255) that pushes the address off the elliptic curve so it doesn't have a private key.

       let signer = [&seeds[..]];  //This variable signer basically says: "I don't have a signature, but I know the secret password combination!

       let cpi_ctx = CpiContext::new_with_sniper(
        ctx.accounts.token_program.to_account_info(),
        token::Transfer{ 
            from: ctx.accounts.ico_ata_for_ico_program.to_account_info(), // from program account
                to: ctx.accounts.ico_ata_for_user.to_account_info(), // to user account
                authority: ctx.ico_ata_for_ico_program.to_account_info(), // signed by program account
            },
            &signer,         
       );

       token::transfer(cpi_ctx, raw_token_amount)?; // here the sold tokens are transferred to the user and sold token get subtracted from program account automatically
       
       //UPDATE DATA
         let data = &mut ctx.accounts.data;
            data.tokens_sold = data
            .tokens_sold
            .checked_add(token_amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Transferred {} ICO tokens to Buyer", token_amount);
        Ok(())

         

      
        

    }
//----------------------------------Structs Section----------------------------------//


    #[derive(Accounts)]
    pub struct CreateIcoATA<'info>{

        #[account(
            init, // initialize the account
            payer=admin,
            seeds=[ ICO_MINT_ADDRESS.parse::<Pubkey>().unwrap().as_ref() ],
            bump,
            token::mint=ico_mint,
            token::authority=ico_ata_for_ico_program, // the program will be the authority of this account Self-custody via PDA
        )]

        pub ico_ata_for_ico_program: Account<'info,TokenAccount>,

        #[account(
            init, payer=admin , 
            space= 9000, // its for storage, here its 9000 byres for just demo purpose , calculating exact space will save cost (gas fee)
            seeds=[b"data"], 
            admin.key().as_ref(), 
            bump
        )]

        pub data: Account<'info,Data>,

        #[account(
            address = ICO_MINT_ADDRESS.parse::<Pubkey>().unwrap(), //Ensure the account passed here MATCHES this specific hardcoded address.
        )]

        pub ico_mint: Account<'info,Mint>, // the mint address of the ICO token

        #[account(mut)]
        pub ico_ata_for_admin: Account<'info,TokenAccount>, // admin's ATA from which ICO tokens will be transferred to program ATA

        #[account(mut)]
        pub admin: Signer<'info>, // the admin wallet  who pays for the account initialization

        pub system_program: Program<'info,System>, // Solana system program
        pub token_program: Program<'info,Token>, // SPL token program
        pub rent: Sysvar<'info,Rent>, // calculates the rent cost for account initialization
        

    }

    #[derive(Accounts)]

    pub struct DepositeIcoATA<'info>{

        #[account(mut)] // mut means this account will be modified , because tokens will be added to it
        pub ico_ata_for_ico_program: Account<'info,TokenAccount>,

        #[account(mut)]
        pub data: Account<'info,Data>,

        #[account(
            address = ICO_MINT_ADDRESS.parse::<Pubkey>().unwrap(),  //Ensure the account passed here MATCHES this specific hardcoded address.
        )]

        pub ico_mint: Account<'info,Mint>,

        #[account(mut)]
        pub ico_ata_for_admin: Account<'info,TokenAccount>,

        #[account(mut)]
        pub admin: Signer<'info>,
        pub token_program: Program<'info,Token>,
    }

    #[derive(Accounts)]
    #[instruction(ico_ata_for_ico_program_bump:u8)] //it's used to pass the bump value to the context and verify the PDA that its the actual program account

    pub struct BuyTokens<'info>{

        #[account(
            mut,
            seeds=[ ico_mint.key().as_ref() ], //reverifying to stop Phishing
            bump=ico_ata_for_ico_program_bump
        )]

        pub ico_ata_for_ico_program: Account<'info,TokenAccount>,

        #[account(mut)]
        pub data: Account<'info,Data>,

        #[account(

             //ICO_MINT_ADDRESS is a String (text). 
            //Solana accounts are Pubkeys (32 bytes of binary data). 
            //They are different languages.
            //The Fix: .parse() translates the Text into binary Data.
            //prevents from depositing wrong tokens 
            //By writing .unwrap(), we are telling Rust: "I am sure this String is a valid Pubkey. If it's not, crash the program."

            address = ICO_MINT_ADDRESS.parse::<Pubkey>().unwrap(),
        )]
           
             
        pub ico_mint: Account<'info,Mint>, //verifying if the token being bought to the actual buyer

        #[account(mut)]
        pub ico_ata_for_user: Account<'info,TokenAccount>, //customer's ATA where bought tokens will be sent , it will be changed thats why mut is needed

        #[account(mut)]
        pub user: Signer<'info>, //ensures the person calling the function actually owns this wallet , mut because account balance will get subtract to pay the admin+gas fee

        pub token_program: Program<'info,Token>,

        //CHECK
        #[account(mut)]
        pub admin: AccountInfo<'info>,

        pub token_program: Program<'info,Token>, //moves the tokens
        pub system_program: Program<'info,System>, //moves the SOL
    }

    #[derive(Accounts)]
    pub struct Data{

        pub admin: Pubkey,
        pub total_tokens: u64,
        pub tokens_sold: u64,
    }




}

