#![cfg(test)]

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal,
};

fn create_token(env: &Env) -> (Address, Address, PollRewardTokenClient<'_>) {
    let admin = Address::generate(env);
    let contract_id = env.register(
        PollRewardToken,
        (&admin, &symbol_short!("PollPts"), &symbol_short!("POLLPTS")),
    );
    let client = PollRewardTokenClient::new(env, &contract_id);
    (admin, contract_id, client)
}

#[test]
fn constructor_sets_metadata() {
    let env = Env::default();
    let (admin, _, client) = create_token(&env);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.name(), symbol_short!("PollPts"));
    assert_eq!(client.symbol(), symbol_short!("POLLPTS"));
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn mint_updates_balance_and_supply() {
    let env = Env::default();
    let (admin, contract_id, client) = create_token(&env);
    let voter = Address::generate(&env);

    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "mint",
                args: (voter.clone(), 5_u32).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .mint(&voter, &5);

    assert_eq!(client.balance(&voter), 5);
    assert_eq!(client.total_supply(), 5);
}

#[test]
fn admin_can_be_handed_off() {
    let env = Env::default();
    let (admin, contract_id, client) = create_token(&env);
    let poll_contract = Address::generate(&env);

    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "set_admin",
                args: (poll_contract.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .set_admin(&poll_contract);

    assert_eq!(client.admin(), poll_contract);
}
