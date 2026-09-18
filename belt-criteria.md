# BJJ Promotion Requirements Reference

## meta

```yaml
scope: IBJJF federation minimums + common academy practice
authority: instructor discretion, per-student, case-by-case
note: ibjjf_min is a binding federation rule; practical_min and technical/behavioral criteria are common practice, not law
belt_order: [white, blue, purple, brown, black]
stripes_max_per_belt: 4          # exception: black belt has no stripe system, uses degrees (danges) instead
stripe_interval_months: [2, 4]   # shorter at white/blue, longer at higher belts
stripe_criteria:
  - attendance_consistency
  - drilling_execution_accuracy
  - sparring_performance
  - mat_etiquette
stripe_decision_maker: instructor_only  # no federation rule governs stripe issuance
```

## transitions

```yaml
- id: white_to_blue
  ibjjf_min_years: null
  practical_min_years: [0.5, 1]
  age_min_years: null
  technical:
    - basic_guard_mount_side_control_back_control_offense_and_defense
    - survive_sparring_without_easy_submission
    - safety_rules_timely_tap_submission_control
  behavioral:
    - basic_mat_etiquette
    - respect_for_training_partners

- id: blue_to_purple
  ibjjf_min_years: 2
  practical_min_years: [2, 3]
  age_min_years: null
  technical:
    - recognizable_personal_game_preferred_positions_and_sequences
    - solid_guard_passing_submissions_transitions
    - holds_own_in_sparring_vs_equal_or_higher_belts
  behavioral:
    - training_consistency
    - reliability_at_academy

- id: purple_to_brown
  ibjjf_min_years: 1.5
  practical_min_years: [1.5, 2]
  age_min_years: null
  technical:
    - mature_technical_game
    - fluid_technique_chaining
    - advanced_positional_control
    - can_correct_and_help_lower_belts
  behavioral:
    - active_academy_contribution
    - mentoring_or_teaching_assistance

- id: brown_to_black
  ibjjf_min_years: 1
  practical_min_years: [1, 2]
  age_min_years: 19
  technical:
    - adapts_game_against_varied_opponent_styles
    - able_to_teach_full_curriculum
  behavioral:
    - overall_martial_maturity
    - sustained_leadership_over_time
    - humility_and_respect_for_tradition
    - long_term_dedication_to_art_and_academy
```

## hours_model

```yaml
assumptions:
  session_length_hours: 1.5
  training_weeks_per_year: 48   # excludes breaks, injury, holidays
formula: hours_per_year = weekly_frequency * session_length_hours * training_weeks_per_year
hours_per_year_by_frequency:
  2x_week: 144
  3x_week: 216
  4x_week: 288
  5x_week: 360
```

## hours_by_transition

```yaml
- id: white_to_blue
  years: [0.5, 1]
  hours:
    2x_week: [72, 144]
    3x_week: [108, 216]
    4x_week: [144, 288]
    5x_week: [180, 360]

- id: blue_to_purple
  years: 2
  hours:
    2x_week: 288
    3x_week: 432
    4x_week: 576
    5x_week: 720

- id: purple_to_brown
  years: 1.5
  hours:
    2x_week: 216
    3x_week: 324
    4x_week: 432
    5x_week: 540

- id: brown_to_black
  years: 1
  hours:
    2x_week: 144
    3x_week: 216
    4x_week: 288
    5x_week: 360
```

## cumulative_totals

```yaml
- range: blue_to_black_ibjjf_min   # excludes white belt period
  years: 4.5
  hours:
    2x_week: 648
    3x_week: 972
    4x_week: 1296
    5x_week: 1620

- range: white_to_black_practical_observed
  years: [8, 12]
  hours: null   # not modeled; real-world variance too high for linear projection
  note: exceeds ~5-6y theoretical sum of minimums due to plateaus, injuries, inconsistent attendance, subjective readiness gating
```

## evaluation_factors

```yaml
# non-time-based; can override pure time/stripe arithmetic
- factor: competition_results
  effect: weighted_if_student_competes
- factor: academy_culture
  effect: promotion_pace_varies_by_team_or_federation_philosophy
- factor: personal_context
  effect: age_injury_history_goals_sport_vs_self_defense_vs_hobby
- factor: instructor_discretion
  effect: final_and_absolute
  note: time_and_stripe_minimums_are_necessary_but_not_sufficient
```

## data_quality

```yaml
ibjjf_min: official_federation_rule    # verifiable, stable
practical_min: aggregate_community_observation  # variable, non-authoritative
hours_model: linear_approximation      # ignores training intensity, instruction quality, private lessons
stripe_and_soft_criteria: instructor_subjective_by_design  # no universal ruleset beyond IBJJF time+age floors
```