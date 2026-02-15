---
title: Math and Equations
tags:
  - showcase
  - markdown
  - math
  - katex
created: 2026-02-15
---

# Math and Equations

Obsidian uses KaTeX for rendering math expressions. Inline math uses single `$` delimiters, block math uses `$$`.

## Inline Math

Euler's identity $e^{i\pi} + 1 = 0$ is often called the most beautiful equation in mathematics.

The quadratic formula gives us $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ for any quadratic equation $ax^2 + bx + c = 0$.

In statistics, the standard deviation is $\sigma = \sqrt{\frac{1}{N}\sum_{i=1}^{N}(x_i - \mu)^2}$ where $\mu$ is the mean.

The probability of event $A$ given $B$ is $P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$ (Bayes' theorem).

## Block Math

The Gaussian integral:

$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$

Maxwell's equations in differential form:

$$\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}$$

$$\nabla \cdot \mathbf{B} = 0$$

$$\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}$$

$$\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}$$

## Matrices and Systems

A system of linear equations:

$$\begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \\ 7 & 8 & 9 \end{pmatrix} \begin{pmatrix} x \\ y \\ z \end{pmatrix} = \begin{pmatrix} a \\ b \\ c \end{pmatrix}$$

The determinant of a 2×2 matrix:

$$\det\begin{pmatrix} a & b \\ c & d \end{pmatrix} = ad - bc$$

## Calculus

The fundamental theorem of calculus:

$$\int_a^b f'(x)\,dx = f(b) - f(a)$$

Taylor series expansion of $e^x$:

$$e^x = \sum_{n=0}^{\infty} \frac{x^n}{n!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots$$

The chain rule: if $y = f(g(x))$, then $\frac{dy}{dx} = f'(g(x)) \cdot g'(x)$.

## Aligned Equations

Solving a quadratic step by step:

$$\begin{aligned}
x^2 + 6x + 5 &= 0 \\
(x + 1)(x + 5) &= 0 \\
x &= -1 \text{ or } x = -5
\end{aligned}$$

## Greek Letters and Symbols

Common symbols: $\alpha, \beta, \gamma, \delta, \epsilon, \theta, \lambda, \mu, \pi, \sigma, \omega$

Operators: $\sum, \prod, \int, \partial, \nabla, \infty, \forall, \exists, \in, \notin, \subset, \cup, \cap$

Arrows: $\rightarrow, \leftarrow, \Rightarrow, \Leftarrow, \leftrightarrow, \mapsto$

Relations: $\leq, \geq, \neq, \approx, \equiv, \sim, \propto$
