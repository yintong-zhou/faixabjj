# BJJ Promotion Requirements Reference

## meta

```yaml
sources:
  - id: ibjjf
    title: IBJJF — General System of Graduation (2026)
    authority: binding federation rule
    precedence: highest   # where this document and community practice disagree, IBJJF wins
  - id: practice
    title: common academy practice, aggregate community observation
    authority: non-binding, variable by academy
scope: belt-to-belt promotions up to black belt, plus black belt degrees
authority: instructor discretion, per-student, case-by-case
note: >
  IBJJF age and time floors are law; practical minimums, the hours model and the
  technical/behavioral criteria are common practice, not law. For children the
  IBJJF system is suggested; for adults up to brown belt promotion is at the
  professor's discretion; for black belt and its degrees IBJJF rules apply.
belt_order: [white, blue, purple, brown, black]
stripes_max_per_belt: 4          # exception: black belt has no stripe system, it has 6 degrees
stripe_interval_months: [2, 4]   # shorter at white/blue, longer at higher belts
stripe_criteria:
  - attendance_consistency
  - drilling_execution_accuracy
  - sparring_performance
  - mat_etiquette
stripe_decision_maker: instructor_only  # no federation rule governs stripe issuance
```

## children_and_youth

Ages 4–15. IBJJF, suggested rather than binding.

### minimum_age_by_group

```yaml
- group: white
  belts: [white]
  age_min_years: null   # any age
- group: grey
  belts: [grey_white, grey, grey_black]
  age_min_years: 4
- group: yellow
  belts: [yellow_white, yellow, yellow_black]
  age_min_years: 7
- group: orange
  belts: [orange_white, orange, orange_black]
  age_min_years: 10
- group: green
  belts: [green_white, green, green_black]
  age_min_years: 13
```

### minimum_time_in_belt

```yaml
value: null
note: no mandatory minimum time for children and youth
```

### promotion_methods

Promotion happens on completing the degrees required by the method the
professor has adopted.

```yaml
- method: quarterly
  frequency_months: 3
  degrees_per_belt: 3        # white degrees
  promoting_degree: 4
- method: triannual
  frequency_months: 4
  degrees_per_belt: 2
  promoting_degree: 3
- method: monthly
  frequency_months: 1
  degrees_per_belt: 11       # 4 white, 4 red, 3 of the next belt colour
  promoting_degree: 12
- method: white_to_grey_white
  frequency_months: 1
  degrees_per_belt: 6        # 1 degree per month for 6 months
  promoting_degree: 6
```

### transition_at_16

```yaml
- from: white
  to: white        # may remain white
- from: grey
  to: blue
- from: yellow
  to: blue
- from: orange
  to: blue
- from: green
  to: [blue, purple]   # at the professor's discretion
```

## transitions

Adults and youth aged 16 and older (juvenile 1 and up). The `ibjjf_*` fields are
federation rules; `practical_min_years`, `technical` and `behavioral` are common
practice.

```yaml
- id: white_to_blue
  ibjjf_min_years: null          # no minimum time
  ibjjf_age_min_years: 16
  practical_min_years: [0.5, 1]
  reductions: null
  technical:
    - basic_guard_mount_side_control_back_control_offense_and_defense
    - survive_sparring_without_easy_submission
    - safety_rules_timely_tap_submission_control
  behavioral:
    - basic_mat_etiquette
    - respect_for_training_partners

- id: blue_to_purple
  ibjjf_min_years: 2
  ibjjf_age_min_years: 16
  practical_min_years: [2, 3]
  reductions:
    - condition: previously_grey_yellow_or_orange
      min_years: 1
    - condition: previously_green_or_juvenile_blue_or_adult_world_champion_at_blue
      min_years: 0
  technical:
    - recognizable_personal_game_preferred_positions_and_sequences
    - solid_guard_passing_submissions_transitions
    - holds_own_in_sparring_vs_equal_or_higher_belts
  behavioral:
    - training_consistency
    - reliability_at_academy

- id: purple_to_brown
  ibjjf_min_years: 1.5
  ibjjf_age_min_years: 18
  practical_min_years: [1.5, 2]
  reductions:
    - condition: previously_juvenile_blue
      min_years: 1
    - condition: previously_orange_or_green_plus_juvenile_blue_or_juvenile_purple_or_adult_world_champion_at_purple
      min_years: 0
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
  ibjjf_age_min_years: 18
  practical_min_years: [1, 2]
  reductions:
    - condition: adult_world_champion_at_brown
      min_years: 0
  note: >
    black belt at 18 is reserved for athletes who won the Adult World
    Championship title at brown belt
  technical:
    - adapts_game_against_varied_opponent_styles
    - able_to_teach_full_curriculum
  behavioral:
    - overall_martial_maturity
    - sustained_leadership_over_time
    - humility_and_respect_for_tradition
    - long_term_dedication_to_art_and_academy
```

## black_belt_degrees

The black belt is not promoted to a further belt; it is divided into 6 degrees.
Out of scope for this app, which models belts and stripes only.

```yaml
- degree: 1
  min_years_from_previous: 3
  min_years_total_at_black: 3
- degree: 2
  min_years_from_previous: 3
  min_years_total_at_black: 6
- degree: 3
  min_years_from_previous: 3
  min_years_total_at_black: 9
- degree: 4
  min_years_from_previous: 5
  min_years_total_at_black: 14
- degree: 5
  min_years_from_previous: 5
  min_years_total_at_black: 19
- degree: 6
  min_years_from_previous: 5
  min_years_total_at_black: 24
```

### ibjjf_administrative_requirements

Apply to the black belt and its degrees.

```yaml
- affiliated_with_ibjjf_at_time_of_application
- no_provisional_graduation
- first_aid_or_cpr_certificate
- ibjjf_referee_training_rules_seminar_or_rules_webinar_certificate_within_12_months
```

## hours_model

```yaml
assumptions:
  session_length_hours: 1        # this gym's actual lesson; the community model this summarises assumes 1.5, and every hours figure below was divided by 1.5 to match
  training_weeks_per_year: 48   # excludes breaks, injury, holidays
formula: hours_per_year = weekly_frequency * session_length_hours * training_weeks_per_year
hours_per_year_by_frequency:
  2x_week: 96
  3x_week: 144
  4x_week: 192
  5x_week: 240
```

## hours_by_transition

```yaml
- id: white_to_blue
  years: [0.5, 1]
  hours:
    2x_week: [48, 96]
    3x_week: [72, 144]
    4x_week: [96, 192]
    5x_week: [120, 240]

- id: blue_to_purple
  years: 2
  hours:
    2x_week: 192
    3x_week: 288
    4x_week: 384
    5x_week: 480

- id: purple_to_brown
  years: 1.5
  hours:
    2x_week: 144
    3x_week: 216
    4x_week: 288
    5x_week: 360

- id: brown_to_black
  years: 1
  hours:
    2x_week: 96
    3x_week: 144
    4x_week: 192
    5x_week: 240
```

## cumulative_totals

```yaml
- range: blue_to_black_ibjjf_min   # excludes white belt period
  years: 4.5
  hours:
    2x_week: 432
    3x_week: 648
    4x_week: 864
    5x_week: 1080

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
ibjjf_rules: official_federation_rule    # verifiable, stable; highest precedence
practical_min: aggregate_community_observation  # variable, non-authoritative
hours_model: linear_approximation      # ignores training intensity, instruction quality, private lessons
stripe_and_soft_criteria: instructor_subjective_by_design  # no universal ruleset beyond IBJJF time+age floors
children_system: suggested_not_binding  # IBJJF states it as a suggestion for ages 4-15
```
