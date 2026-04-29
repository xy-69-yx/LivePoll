#![no_std]

use soroban_sdk::{
    assert_with_error, contract, contracterror, contractevent, contractimpl, contracttype, Address,
    Env, Symbol,
};

const INSTANCE_BUMP_THRESHOLD: u32 = 1_000;
const INSTANCE_BUMP_AMOUNT: u32 = 10_000;
const PERSISTENT_BUMP_THRESHOLD: u32 = 1_000;
const PERSISTENT_BUMP_AMOUNT: u32 = 10_000;

#[contract]
pub struct PollRewardToken;

#[contracttype]
#[derive(Clone)]
enum TokKey {
    Admin,
    Name,
    Sym,
    Supply,
    Bal(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokError {
    AlreadyInit = 1,
    Missing = 2,
    ZeroAmt = 3,
}

#[contractevent(topics = ["minted"], data_format = "vec")]
pub struct Minted {
    #[topic]
    pub to: Address,
    pub amount: u32,
    pub balance: u32,
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_balance(env: &Env, key: &TokKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

fn read_admin(env: &Env) -> Address {
    bump_instance(env);
    env.storage()
        .instance()
        .get(&TokKey::Admin)
        .unwrap_or_else(|| panic!("admin missing"))
}

fn read_u32(env: &Env, key: &TokKey) -> u32 {
    bump_instance(env);
    env.storage().instance().get(key).unwrap_or(0)
}

fn read_symbol(env: &Env, key: &TokKey) -> Symbol {
    bump_instance(env);
    env.storage()
        .instance()
        .get(key)
        .unwrap_or_else(|| panic!("symbol missing"))
}

#[contractimpl]
impl PollRewardToken {
    pub fn __constructor(env: Env, admin: Address, name: Symbol, sym: Symbol) {
        assert_with_error!(
            &env,
            !env.storage().instance().has(&TokKey::Admin),
            TokError::AlreadyInit
        );

        env.storage().instance().set(&TokKey::Admin, &admin);
        env.storage().instance().set(&TokKey::Name, &name);
        env.storage().instance().set(&TokKey::Sym, &sym);
        env.storage().instance().set(&TokKey::Supply, &0_u32);
        bump_instance(&env);
    }

    pub fn set_admin(env: Env, next: Address) {
        let admin = read_admin(&env);
        admin.require_auth();

        env.storage().instance().set(&TokKey::Admin, &next);
        bump_instance(&env);
    }

    pub fn admin(env: Env) -> Address {
        read_admin(&env)
    }

    pub fn mint(env: Env, to: Address, amount: u32) -> u32 {
        assert_with_error!(&env, amount > 0, TokError::ZeroAmt);

        let admin = read_admin(&env);
        admin.require_auth();

        let balance_key = TokKey::Bal(to.clone());
        let current_balance: u32 = env.storage().persistent().get(&balance_key).unwrap_or(0);
        let next_balance = current_balance.saturating_add(amount);
        env.storage().persistent().set(&balance_key, &next_balance);
        bump_balance(&env, &balance_key);

        let supply = read_u32(&env, &TokKey::Supply).saturating_add(amount);
        env.storage().instance().set(&TokKey::Supply, &supply);
        bump_instance(&env);

        Minted {
            to,
            amount,
            balance: next_balance,
        }
        .publish(&env);

        next_balance
    }

    pub fn balance(env: Env, owner: Address) -> u32 {
        let balance_key = TokKey::Bal(owner);
        let balance = env.storage().persistent().get(&balance_key).unwrap_or(0);

        if balance > 0 {
            bump_balance(&env, &balance_key);
        }

        balance
    }

    pub fn total_supply(env: Env) -> u32 {
        read_u32(&env, &TokKey::Supply)
    }

    pub fn name(env: Env) -> Symbol {
        read_symbol(&env, &TokKey::Name)
    }

    pub fn symbol(env: Env) -> Symbol {
        read_symbol(&env, &TokKey::Sym)
    }
}

#[cfg(test)]
mod test;
