@foundation @F01 @F02
Feature: Foundation API readiness against PostgreSQL
  As the QA Evidence Hub operator
  I need the API readiness endpoint to confirm live PostgreSQL connectivity
  So that reverse-proxy health checks and CI Foundation gates detect database outages

  Scenario: /api/v1/health/ready returns 200 when PostgreSQL is available
    Given the NestJS API is booted with a migrated PostgreSQL database
    When a client requests GET "/api/v1/health/ready"
    Then the response status code is 200
    And the JSON response body equals:
      """
      {
        "status": "ready"
      }
      """
    And the response header "cache-control" equals "no-store"
    And the response header "x-content-type-options" equals "nosniff"
