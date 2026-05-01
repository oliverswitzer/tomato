# Tomato Product Direction Report
## For Product Manager Agent

### Current product state
Tomato is currently a Pomodoro timer that:
- asks the user for a task before starting
- summarizes screen activity
- checks roughly every 1 minute
- prompts the user if it detects drift away from the stated task

This report summarizes the strongest themes from user interviews, adjacent research, and external examples, then prioritizes the top 3 product pillars to guide next decisions.

---

# Executive summary

The clearest signal so far is that Tomato should not evolve into a generic timer or blocker.

The strongest opportunity is to become a **context aware accountability companion for solo builders** that helps them:
1. start with a clear intention
2. notice when they drift into productive avoidance
3. reflect on whether their time actually moved the business forward

The product should stay especially focused on work that is easy to avoid even though it matters most:
- validation
- outreach
- customer conversations
- prioritization
- follow through

A key pattern across research is that users do **not** primarily want stricter blocking. They want a product that understands context, notices “comfortable but lower leverage work,” and helps them recover momentum without shame.

---

# Sources behind this synthesis

## Interview and feedback sources
- **Laurie Stark**
- **Jason Carter**
- **Alex Tran**
- **podcast note** about low friction voice capture and end of day reflection
- **Hush Reddit thread** as adjacent product signal
- **live streamer whiteboard observation**
- **market research report**
- **Reddit commenters** on your LLM / founder psychology thread
- **your own observations and product thinking**

---

# Strongest common themes

## 1. The real enemy is not classic distraction
It is work that feels productive but does not move the business forward.

**Who mentioned it:** Laurie, Jason, market research report, Reddit commenters, your own reflections

Examples:
- AI rabbit holes
- feature work instead of validation
- customer request rabbit holes
- planning / polishing / researching instead of traction work

## 2. Context matters more than app category
The same site or tool can be useful or distracting depending on the user’s intention.

**Who mentioned it:** Jason, Laurie, Hush thread, your own thinking

Examples:
- Reddit can be research or drift
- LinkedIn can be outreach or avoidance
- YouTube can be tutorial or distraction
- Claude can be shipping help or a vibe hole

## 3. Intention matters more than rigid timeboxing
Users want structure, but not dumb rigidity.

**Who mentioned it:** Jason, Laurie, podcast note, your own thinking

There is more signal for:
- clear session intention
- optional phases or modes
- flexible guidance

than for:
- strict timer purity
- rigid calendar discipline

## 4. Reflection is highly valuable
People repeatedly want help answering: “What did I actually do today?”

**Who mentioned it:** Laurie, podcast note, your own thinking

## 5. The hardest work is often the slow, ambiguous, human work
This includes validation, outreach, prioritization, and following through when the reward drops.

**Who mentioned it:** Laurie, market research report, Reddit commenters, your own reflections

## 6. Users want gentle guidance, not punishment
The product should feel like a calm companion, not a hall monitor.

**Who mentioned it:** Laurie, Jason, your own product thinking

## 7. Privacy matters, but serious users may tolerate friction
Privacy messaging must be strong, but not every user is equally sensitive. Some upfront friction may even self select for committed users.

**Who mentioned it:** Laurie, Jason, Hush thread, your research

## 8. ADHD adjacent framing keeps surfacing
This may be an important adjacent persona or GTM route.

**Who mentioned it:** Jason, Alex Tran, Hush thread

## 9. Ambient cues and visible commitments may help
Some builders benefit from always visible goals, simple scoreboards, and externalized priorities.

**Who mentioned it:** streamer whiteboard observation, your own instincts

## 10. The deepest psychological theme is reward distortion
LLMs create a dense reward stream. Then slower business work feels disproportionately hard to return to.

**Who mentioned it:** your own reflections, Reddit commenters, market research indirectly

---

# Recommended product pillars

These are the top 3 pillars Tomato should optimize around right now.

---

## Pillar 1: Intention first sessions
### Why this is a pillar
The strongest signal is that users need help starting with a clear intention, not just a timer. The app should know what the session is for, because that context is what makes drift detection useful.

**Backed by:** Jason, Laurie, podcast note, your own thinking

### Product principle
Tomato should center on:
- what this session is for
- what kind of work the user intends to do
- what “moving forward” looks like for this session

not just:
- how many minutes are left

### Priority feature ideas
#### 1. Session intention setup
Before a session starts, collect:
- the user’s goal for this session
- optionally a lightweight work type such as:
  - building
  - validating
  - promoting
  - customer conversations
  - admin / delivery

This should stay lightweight and not feel like project management.

#### 2. Intention aware timer flow
Keep the Pomodoro timer, but make the timer subordinate to the session purpose.
Examples:
- “What is this session for?”
- “What would progress look like by the end?”
- optional preset session types with examples

### Notes
This is the best way to reduce false positives later.
The coach is only as good as the context the user gives it.

---

## Pillar 2: Context aware drift detection
### Why this is a pillar
This is the core differentiator. Users do not want blunt blockers. They want the app to understand when they have moved from useful work into comfortable avoidance.

**Backed by:** Jason, Laurie, Hush thread, your own thinking

### Product principle
The app should try to answer:
**“Are you still doing the kind of work you said would move this forward right now?”**

not just:
**“Are you on a bad website?”**

### Priority feature ideas
#### 1. Better drift checks tied to session intention
Use the current session goal plus screen summary to trigger more contextual check-ins.
Examples:
- “This looks a bit off track for your validation session.”
- “Are you still working on [goal], or did you hit a tangent?”

#### 2. Soft correction options in the alert
When drift is detected, offer small, humane actions:
- back to session
- this is relevant
- park this for later
- I’m stuck / need a break

This is better than a pure alert because it supports recovery, not just compliance.

### Notes
A future version can get smarter about:
- repeated visits to the same site after friction
- frustration signals in prompts
- drift patterns over time

But MVP should keep the interaction simple and supportive.

---

## Pillar 3: Reflection and proof of progress
### Why this is a pillar
People consistently want help understanding what they actually did and whether it mattered. This is looking like core value, not a bonus feature.

**Backed by:** Laurie, podcast note, your own thinking

### Product principle
Tomato should not only interrupt drift.
It should also help users reconstruct:
- what happened
- what they focused on
- whether the session actually moved the work forward

### Priority feature ideas
#### 1. End of session recap
After a session, show a simple recap:
- session goal
- focus time
- drift moments
- summary of what happened
- optional user confirmation: did this move things forward?

#### 2. End of day / end of week summary
Generate a lightweight reflection view:
- what you worked on
- what distracted you
- what progress patterns emerged
- where time went compared to intentions

### Notes
This could become one of the stickiest features, especially for solo builders who feel they work constantly but struggle to remember what they accomplished.

---

# Product implications for the current Tomato MVP

## What to preserve
- Timer based session structure
- Task / intention entered before start
- Drift checks during session
- Screen summarization

## What to improve next
### 1. Upgrade “task” into “session intention”
The current single task field is directionally right, but should become richer and more explicit.

### 2. Make drift alerts more contextual and more humane
The current “you drifted” alert should evolve into:
- intention aware
- gentle
- recovery oriented

### 3. Add a recap loop
Right now Tomato sounds stronger during the session than after it.
Reflection should become a first class part of the loop.

---

# Suggested near term roadmap

## Next 1
Refine session start flow
- task becomes session intention
- optional work type selection
- make it obvious what success looks like for this session

## Next 2
Refine drift check UX
- better wording
- offer “this is relevant” and “park for later”
- optionally offer “I’m stuck” / “take a break”

## Next 3
Add basic session recap
- what happened
- when drift occurred
- quick summary
- user can mark whether session felt useful

## Next 4
Add daily reflection prototype
- basic end of day summary
- likely very high learning value

---

# What Tomato should not become right now
Do not let MVP drift into:
- a full task manager
- a generic app blocker
- a pure ADHD wellness app
- a GTM playbook generator
- a broad personal life coach

The sharpest near term version is:
**an intention aware timer with contextual drift detection and meaningful reflection for solo builders**

---

# One sentence direction
Tomato should evolve from a Pomodoro timer that detects off-task behavior into a **context aware work companion that helps solo builders stay intentional, notice productive avoidance, and reflect on whether their time actually moved the business forward.**