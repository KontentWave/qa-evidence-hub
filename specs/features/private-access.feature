@phase1 @S1 @AC07
Feature: Keep the personal workspace private

  Scenario Outline: Require login for protected HTML pages
    Given I am not signed in
    When I request the <page> directly
    Then I am redirected to login without protected content

    Examples:
      | page               |
      | project page       |
      | finding page       |
      | project report     |

  Scenario: Block a direct evidence download without login
    Given I am not signed in
    When I request a valid private evidence download URL
    Then I receive an unauthorized response with no evidence bytes
    And I am not redirected to a publicly accessible provider file

  Scenario: Reject a mutation without a valid anti-CSRF token
    Given I am signed in as the provisioned owner
    When I submit an otherwise valid finding creation request without a valid anti-CSRF token
    Then the request is rejected without creating records

  @P1-03
  Scenario: Do not provide public self-registration
    Given the owner account has been provisioned
    When an anonymous visitor attempts to register an account
    Then no public registration operation is available
    And no additional account is created

  @P1-03
  Scenario: Sign in as the provisioned owner and sign out cleanly
    Given the owner account has been provisioned
    And I am not signed in
    When I request the current owner session
    Then I receive an unauthorized response without owner data
    When I sign in as the provisioned owner with a valid pre-login anti-CSRF token
    Then my owner session is active
    When I sign out with a valid authenticated anti-CSRF token
    Then my session cookie is cleared and the session is invalidated

  @P1-03
  Scenario: Reject invalid login credentials generically
    Given the owner account has been provisioned
    When I attempt to sign in with an incorrect password and a valid pre-login anti-CSRF token
    Then the login attempt is rejected generically without issuing a session

