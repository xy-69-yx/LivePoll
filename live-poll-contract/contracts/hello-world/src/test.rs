#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal,
};

#[contract]
pub struct RewardStub;

#[contracttype]
#[derive(Clone)]
enum StubKey {
    Admin,
    Bal(Address),
    Total,
}

#[contractimpl]
impl RewardStub {
    pub fn reward_init(env: Env, admin: Address) {
        env.storage().instance().set(&StubKey::Admin, &admin);
        env.storage().instance().set(&StubKey::Total, &0_u32);
    }

    pub fn mint(env: Env, to: Address, amount: u32) -> u32 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&StubKey::Admin)
            .unwrap_or_else(|| panic!("admin missing"));
        admin.require_auth();

        let balance_key = StubKey::Bal(to.clone());
        let next_balance = env
            .storage()
            .persistent()
            .get::<_, u32>(&balance_key)
            .unwrap_or(0)
            .saturating_add(amount);
        env.storage().persistent().set(&balance_key, &next_balance);
        env.storage().instance().set(
            &StubKey::Total,
            &env.storage()
                .instance()
                .get::<_, u32>(&StubKey::Total)
                .unwrap_or(0)
                .saturating_add(amount),
        );

        next_balance
    }

    pub fn balance(env: Env, owner: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&StubKey::Bal(owner))
            .unwrap_or(0)
    }
}

fn create_poll(env: &Env) -> (Address, Address, LivePollContractClient<'_>) {
    let admin = Address::generate(env);
    let reward_id = env.register(RewardStub, ());
    let poll_id = env.register(LivePollContract, (&admin, &reward_id, &5_u32));
    RewardStubClient::new(env, &reward_id).reward_init(&poll_id);
    let client = LivePollContractClient::new(env, &poll_id);

    (admin, poll_id, client)
}

#[test]
fn get_votes_returns_zero_for_unseen_option() {
    let env = Env::default();
    let (_, _, client) = create_poll(&env);
    let option_a = symbol_short!("OptionA");
    let option_b = symbol_short!("OptionB");

    assert_eq!(client.get_votes(&option_a), 0);
    assert_eq!(client.get_votes(&option_b), 0);
    assert_eq!(client.get_total_votes(), 0);
}

#[test]
fn vote_accumulates_votes_for_the_same_option() {
    let env = Env::default();
    let (_, _, client) = create_poll(&env);
    let option_a = symbol_short!("OptionA");

    client.vote(&option_a);
    client.vote(&option_a);
    client.vote(&option_a);

    assert_eq!(client.get_votes(&option_a), 3);
    assert_eq!(client.get_total_votes(), 3);
}

#[test]
fn vote_tracks_each_option_independently() {
    let env = Env::default();
    let (_, _, client) = create_poll(&env);
    let option_a = symbol_short!("OptionA");
    let option_b = symbol_short!("OptionB");

    client.vote(&option_a);
    client.vote(&option_a);
    client.vote(&option_b);

    assert_eq!(client.get_votes(&option_a), 2);
    assert_eq!(client.get_votes(&option_b), 1);
    assert_eq!(client.get_last_option(), option_b);
}

#[test]
fn vote_for_mints_rewards_and_tracks_wallet_totals() {
    let env = Env::default();
    let (_, poll_id, client) = create_poll(&env);
    let voter = Address::generate(&env);
    let option_a = symbol_short!("OptionA");

    client
        .mock_auths(&[MockAuth {
            address: &voter,
            invoke: &MockAuthInvoke {
                contract: &poll_id,
                fn_name: "vote_for",
                args: (voter.clone(), option_a.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .vote_for(&voter, &option_a);

    assert_eq!(client.get_votes(&option_a), 1);
    assert_eq!(client.get_voter_votes(&voter), 1);
    assert_eq!(client.get_reward_balance(&voter), 5);
}

#[test]
fn admin_can_update_reward_rate_for_future_votes() {
    let env = Env::default();
    let (admin, poll_id, client) = create_poll(&env);
    let voter = Address::generate(&env);
    let option_a = symbol_short!("OptionA");

    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &poll_id,
                fn_name: "set_reward_rate",
                args: (9_u32,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_reward_rate(&9);

    client
        .mock_auths(&[MockAuth {
            address: &voter,
            invoke: &MockAuthInvoke {
                contract: &poll_id,
                fn_name: "vote_for",
                args: (voter.clone(), option_a.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .vote_for(&voter, &option_a);

    assert_eq!(client.get_reward_rate(), 9);
    assert_eq!(client.get_reward_balance(&voter), 9);
}

#[test]
fn invalid_options_are_rejected() {
    let env = Env::default();
    let (_, _, client) = create_poll(&env);
    let invalid_option = symbol_short!("Invalid");

    assert!(client.try_vote(&invalid_option).is_err());
}
