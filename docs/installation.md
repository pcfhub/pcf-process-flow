---
title: Installation
description: Import the solution and put the control on a form.
order: 2
---

# Installation

:::steps
1. **Download the solution.** Take `ProcessFlowSolution_managed.zip` from the
   [latest release](https://github.com/pcfhub/pcf-process-flow/releases) for a
   production environment. The unmanaged zip is for a development environment
   you intend to customise the control in.

2. **Import it.** In the Power Platform admin centre or in
   [make.powerapps.com](https://make.powerapps.com), pick your environment,
   then **Solutions → Import solution**, and choose the file.

3. **Publish all customizations** once the import finishes.

4. **Put it on a form.** Open the table's form in the form designer, select the
   Choice or Multi-Select Choice column, and under **Components → Add
   component** choose **Process Flow**. Save and publish.
:::

## What the column has to be

The control binds a **Choice** or a **Multi-Select Choice** column, and nothing
else. If the component does not appear in the list when you have a column
selected, the column is a different type — a Yes/No, a lookup, or a text column
holding status words. The form designer only offers components whose declared
type matches the column, so an empty list is that mismatch rather than a failed
import.

## Permissions

None. The control declares no `feature-usage` entries, so importing it prompts
for nothing: it reads and writes the column it is placed on and touches no
other platform API.

It is also not premium. `external-service-usage` is disabled, so an app
containing this component does not change what licences its users need.
