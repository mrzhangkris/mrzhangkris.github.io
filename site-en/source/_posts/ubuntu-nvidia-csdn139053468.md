---
title: "Installing the NVIDIA Driver on Ubuntu and Stopping It from Auto-Updating"
date: 2024-05-20 09:18:13
lang: en
updated: 2026-09-14
categories: [Tech, Linux]
tags: [Linux]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1600&q=80&fm=jpg
---

After you install the NVIDIA driver on Ubuntu, a system update will sometimes upgrade the driver along the way, and a version change can bring compatibility or stability problems. This post has two parts: first get the NVIDIA driver installed, then lock the driver version down with two mechanisms — an APT pin and apt-mark. Driver installation and verification require a real GPU, so that part is compiled from the original article's tested record (Ubuntu 18.04 + GTX 1050) and updated to the Ubuntu 24.04 baseline; **the version-locking part (pin file, apt-mark hold) does not depend on a GPU and was fully tested in an Ubuntu 24.04.4 container** — all outputs below are real test results.

## Preparation

Before starting, make sure the system is backed up and you have sudo privileges, then update the system:

```bash
sudo apt update && sudo apt upgrade -y
```

## Identify the GPU Model

First find out the NVIDIA GPU model so you can pick the right driver branch:

```bash
lspci | grep -i nvidia
```

The output looks like `01:00.0 VGA compatible controller: NVIDIA Corporation [model] (rev a1)`.

## Install the NVIDIA Driver

### Check the Recommended Driver

Ubuntu's official repositories ship the `ubuntu-drivers` tool (contained in the ubuntu-drivers-common package; verified installable directly in the 24.04 container), which detects the GPU automatically and lists the available drivers:

```bash
ubuntu-drivers devices
```

Sample output:

```text
driver : nvidia-driver-440 - distro non-free recommended
```

The driver branches the 24.04 (noble) official repositories currently offer measured out at 535 / 550 / 570 (candidate versions 535.309, 550.163, 570.211 respectively), plus older transitional packages with lower numbers in the apt sources. Which branch to install should follow the recommendation of `ubuntu-drivers devices` on your own machine.

> Note: the `ubuntu-drivers devices` output and driver install behavior in this section require a real GPU environment; the original article tested on Ubuntu 18.04 + GTX 1050, which recommended the 440 series. The package-name detection logic is the same codebase; it was not re-run on this machine.

### Install

Install the recommended driver (replace the version number with the recommendation from the previous step):

```bash
sudo apt install nvidia-driver-550
```

Verification point: the installation succeeded when the `Installed:` line in `apt-cache policy nvidia-driver-550` output matches the Candidate — a result you can see before rebooting.

### Optional: The Graphics Drivers PPA

Consider a third-party PPA only when you need drivers newer than the official repositories; the 24.04 official sources already carry 535-570, so ordinary scenarios don't need it:

```bash
sudo add-apt-repository ppa:graphics-drivers/ppa
sudo apt update
```

## Stopping the Driver from Auto-Updating (Container-Tested)

Two measures work together: the APT pin pins version priority, and apt-mark hold locks the install action. Every command and output below was tested in an Ubuntu 24.04.4 container, using `nvidia-driver-550` as the subject (no driver installation required to do this).

### First Measure: the APT Pin File

Create `/etc/apt/preferences.d/nvidia`:

```bash
sudo nano /etc/apt/preferences.d/nvidia
```

Contents (replace the package name and version pattern with your actually installed driver):

```text
Package: nvidia-driver-550
Pin: version 550.*
Pin-Priority: 1001
```

When Pin-Priority is above 1000, APT raises the pinned version's priority over the repositories' default 500 — even if a newer version appears in the repository, it won't be chosen as the candidate. Measured effect: after pinning `version 1.21.4-1ubuntu4.5` at priority 1001, that version carried the `1001` marker in `apt-cache policy`'s version table; after deleting the pin file, the same line fell back to `500`:

```text
Version table:
     1.21.4-1ubuntu4.5 1001      # with pin in place
     1.21.4-1ubuntu4.5 500       # after removing the pin
```

### Second Measure: the apt-mark Lock

```bash
sudo apt-mark hold nvidia-driver-550
```

Measured output: `nvidia-driver-550 set on hold.`. Confirm the lock status:

```bash
apt-mark showhold
```

Measured output: `nvidia-driver-550`. To release the lock, use `apt-mark unhold nvidia-driver-550`; measured output: `Canceled hold on nvidia-driver-550.`.

A handy trick discovered in testing: `apt-mark hold` also works on packages that are **not yet installed** — hold first, install later, and subsequent system updates will never touch that package. Ideal for pre-locking inside provisioning scripts.

## Reboot and Verify

```bash
sudo reboot
```

After the reboot, use `nvidia-smi` to confirm the driver installation:

```bash
nvidia-smi
```

A healthy output includes the GPU model, driver version, memory usage, and so on (below is the original article's tested record on a GTX 1050 + 440.82; new cards and new drivers share the same format with different values):

```text
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 440.82       Driver Version: 440.82       CUDA Version: 10.2     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|===============================+======================+======================|
|   0  GeForce GTX 1050    Off  | 00000000:01:00.0 Off |                  N/A |
| 30%   35C    P8    N/A /  N/A |    162MiB /  2000MiB |      0%      Default |
+-------------------------------+----------------------+----------------------+
```

> Note: `nvidia-smi` output requires a real GPU; this post did not re-run it in the container — the original article's tested record is preserved.

## Common Troubleshooting

### The System Won't Boot

1. Press Shift during boot to enter the GRUB menu.
2. Choose "Advanced options for Ubuntu".
3. Choose recovery mode and enter a root terminal.
4. Purge the NVIDIA driver and reboot:

```bash
sudo apt-get purge 'nvidia-*'
sudo reboot
```

### Black Screen or Low Resolution

1. Switch to a TTY terminal with Ctrl+Alt+F1 (F2-F6 on some machines).
2. After logging in, reinstall the driver:

```bash
sudo apt install --reinstall nvidia-driver-550
```

3. Reboot the system.

## Notes and Cautions

- **Each measure governs a different layer**: the pin governs candidate-version priority (new repository versions won't be selected), hold governs apt's install/upgrade actions (security updates included — they won't move either). Either one alone is roughly sufficient; using both together is the most robust.
- **The pin file's package name and version pattern must match the actual driver**: if you installed 550, write `550.*`; copying the example without editing means the lock is worthless. A pin priority of 1001 (force-pin) is recommended rather than around 100 (which is only a weak preference).
- **Upgrading a locked driver**: run `apt-mark unhold` first, then delete or relax the pin file, and re-lock after the upgrade completes — get the order backwards and apt will fight between the old version and the new lock.
- **The hold can be applied in advance**: tested to work on not-yet-installed packages as well; in a provisioning script, hold before installing the driver and it's naturally immune to later automatic updates.
- **Self-rescue path when you can't get into the system**: GRUB recovery mode → root terminal → `apt-get purge 'nvidia-*'` to fall back to the open-source driver as an emergency fix; for a black screen, switch to a TTY first, then reinstall the driver. These two subsections are the original article's tested record plus standard methods, not re-run in the container.

> This article was rebuilt from the author's CSDN blog posts published between 2020 and 2024, originally published on CSDN.
