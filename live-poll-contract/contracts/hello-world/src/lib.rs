#![no_std]

use soroban_sdk::{
    assert_with_error, contract, contractclient, contracterror, contractevent, contractimpl,
    contracttype, Address, Env, Symbol,
};

const INSTANCE_BUMP_THRESHOLD: u32 = 1_000;
const INSTANCE_BUMP_AMOUNT: u32 = 10_000;
const PERSISTENT_BUMP_THRESHOLD: u32 = 1_000;
const PERSISTENT_BUMP_AMOUNT: u32 = 10_000;

#[contract]
pub struct LivePollContract;

#[contractclient(name = "RewardClient")]
pub trait RewardApi {
    fn mint(env: Env, to: Address, amount: u32) -> u32;
    fn balance(env: Env, owner: Address) -> u32;
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Reward,
    Rate,
    Total,
    Last,
    User(Address),
    Opt(Symbol),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PollError {
    AlreadyInit = 1,
    BadOption = 2,
    ZeroRate = 3,
}

#[contractevent(topics = ["voted"], data_format = "single-value")]
pub struct VoteCast {
    #[topic]
    pub option: Symbol,
    pub votes: u32,
}

#[contractevent(topics = ["rewarded"], data_format = "vec")]
pub struct Rewarded {
    #[topic]
    pub option: Symbol,
    pub amount: u32,
    pub balance: u32,
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_user(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);
}

fn is_valid_option(env: &Env, option: &Symbol) -> bool {
    *option == Symbol::new(env, "OptionA") || *option == Symbol::new(env, "OptionB")
}

fn read_instance_u32(env: &Env, key: &DataKey) -> u32 {
    bump_instance(env);
    env.storage().instance().get(key).unwrap_or(0)
}

fn read_instance_address(env: &Env, key: &DataKey) -> Address {
    bump_instance(env);
    env.storage()
        .instance()
        .get(key)
        .unwrap_or_else(|| panic!("address missing"))
}

fn read_last_option(env: &Env) -> Symbol {
    bump_instance(env);
    env.storage()
        .instance()
        .get(&DataKey::Last)
        .unwrap_or_else(|| Symbol::new(env, "OptionA"))
}

fn store_vote(env: &Env, option: &Symbol) -> u32 {
    assert_with_error!(env, is_valid_option(env, option), PollError::BadOption);

    let option_key = DataKey::Opt(option.clone());
    let current_votes: u32 = env.storage().instance().get(&option_key).unwrap_or(0);
    let next_votes = current_votes.saturating_add(1);

    env.storage().instance().set(&option_key, &next_votes);
    env.storage().instance().set(
        &DataKey::Total,
        &read_instance_u32(env, &DataKey::Total).saturating_add(1),
    );
    env.storage().instance().set(&DataKey::Last, option);
    bump_instance(env);

    VoteCast {
        option: option.clone(),
        votes: next_votes,
    }
    .publish(env);

    next_votes
}

#[contractimpl]
impl LivePollContract {
    pub fn __constructor(env: Env, admin: Address, reward: Address, rate: u32) {
        assert_with_error!(
            &env,
            !env.storage().instance().has(&DataKey::Admin),
            PollError::AlreadyInit
        );
        assert_with_error!(&env, rate > 0, PollError::ZeroRate);

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Reward, &reward);
        env.storage().instance().set(&DataKey::Rate, &rate);
        env.storage().instance().set(&DataKey::Total, &0_u32);
        env.storage()
            .instance()
            .set(&DataKey::Last, &Symbol::new(&env, "OptionA"));
        bump_instance(&env);
    }

    pub fn vote(env: Env, option: Symbol) -> u32 {
        store_vote(&env, &option)
    }

    pub fn vote_for(env: Env, voter: Address, option: Symbol) -> u32 {
        voter.require_auth();

        let next_votes = store_vote(&env, &option);
        let reward_rate = read_instance_u32(&env, &DataKey::Rate);
        let reward_contract = read_instance_address(&env, &DataKey::Reward);

        let user_key = DataKey::User(voter.clone());
        let next_user_votes = env
            .storage()
            .persistent()
            .get::<_, u32>(&user_key)
            .unwrap_or(0)
            .saturating_add(1);
        env.storage().persistent().set(&user_key, &next_user_votes);
        bump_user(&env, &user_key);

        let reward_balance = RewardClient::new(&env, &reward_contract).mint(&voter, &reward_rate);
        Rewarded {
            option,
            amount: reward_rate,
            balance: reward_balance,
        }
        .publish(&env);

        next_votes
    }

    pub fn get_votes(env: Env, option: Symbol) -> u32 {
        assert_with_error!(&env, is_valid_option(&env, &option), PollError::BadOption);

        bump_instance(&env);
        env.storage()
            .instance()
            .get(&DataKey::Opt(option))
            .unwrap_or(0)
    }

    pub fn get_total_votes(env: Env) -> u32 {
        read_instance_u32(&env, &DataKey::Total)
    }

    pub fn get_voter_votes(env: Env, voter: Address) -> u32 {
        let user_key = DataKey::User(voter);
        let votes = env.storage().persistent().get(&user_key).unwrap_or(0);

        if votes > 0 {
            bump_user(&env, &user_key);
        }

        votes
    }

    pub fn get_reward_balance(env: Env, voter: Address) -> u32 {
        let reward_contract = read_instance_address(&env, &DataKey::Reward);
        RewardClient::new(&env, &reward_contract).balance(&voter)
    }

    pub fn get_reward_rate(env: Env) -> u32 {
        read_instance_u32(&env, &DataKey::Rate)
    }

    pub fn get_reward_contract(env: Env) -> Address {
        read_instance_address(&env, &DataKey::Reward)
    }

    pub fn get_last_option(env: Env) -> Symbol {
        read_last_option(&env)
    }

    pub fn set_reward_rate(env: Env, rate: u32) {
        assert_with_error!(&env, rate > 0, PollError::ZeroRate);

        let admin = read_instance_address(&env, &DataKey::Admin);
        admin.require_auth();

        env.storage().instance().set(&DataKey::Rate, &rate);
        bump_instance(&env);
    }
}

#[cfg(test)]
mod test;
