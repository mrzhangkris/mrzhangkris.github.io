---
title: "A/B Testing and Canary Releases with the Nginx split_clients Module"
date: 2024-05-30 15:21:07
updated: 2026-09-14
categories: [Tech, Nginx]
lang: en
tags: [Nginx]
copyright_author: Ganjiang
cover: https://images.unsplash.com/photo-1496181133206-80ce9b88a851?w=1600&q=80&fm=jpg
---

Is the new homepage design really better than the old one? Dare you ship the new feature to everyone at once? A/B testing and canary releases are two phrasings of the same question: how to split traffic into groups by proportion, and do it stably. Nginx's split_clients module (`ngx_http_split_clients_module`) handles this right at the access layer—hashing a user characteristic and slicing traffic by percentage, with no application code involved.

This article is organized around hands-on configuration: first the lab environment, then live tests of three things—whether grouping is stable, whether the ratio is trustworthy, and what happens when you change the ratio. All outputs are actual results from nginx/1.31.5.

## Use Cases

- **A/B testing**: give each of two page versions half the traffic, compare conversion rates and user feedback, and see which version performs better.
- **Canary release**: release the new feature to a small percentage of users first, observe that nothing breaks, then gradually widen it—controlling release risk.
- **Routing by user characteristics**: route specific user groups to different backends or versions based on IP, User-Agent, and similar characteristics.

All three scenarios share one precondition: **the grouping key must be directly obtainable from the request**—IP, User-Agent, headers, and cookie values all qualify. split_clients is simply responsible for "slicing the ratio by this characteristic." If you need to group by login identity, put the user ID into a header or read it from a cookie and feed it into the characteristic string—equally applicable. But deep information the characteristic string can't reach (such as user tiers stored in a database) is beyond what an access layer can do.

## Configuration Example

Split users into two groups by IP plus User-Agent, each group seeing a different homepage version:

```nginx
split_clients "${remote_addr}${http_user_agent}" $variant {
  50%     "A";
  *       "B";
}

server {
  listen 80;

  location / {
    root /var/www/version_$variant;
  }
}
```

Taken apart:

- The first argument of `split_clients`, `"${remote_addr}${http_user_agent}"`, is the user characteristic string participating in the grouping; `$variant` is the variable that stores the grouping result.
- Inside the block, `50% "A"` means requests whose characteristic-string hash lands in the first 50% range get `$variant` set to `"A"`; `* "B"` is the catch-all branch that takes all remaining traffic. The ratios and branch count are adjustable as needed—for example `10%`, `20%`, `*` for a three-tier canary.
- In the location, `$variant` is concatenated straight into the root path: group A reads `/var/www/version_A`, group B reads `/var/www/version_B`. Variable concatenation is leaner than the original's paired `if`s, and carries none of if's many restrictions.

Since the grouping result is an ordinary variable, the uses go beyond slicing root: picking a version for `proxy_pass`'s upstream, adding `add_header X-Variant $variant` to responses for easier frontend instrumentation and debugging, or writing it into the log format to count each group's actual traffic—all the same idea. The division of labor with the `map` directive is also worth a sentence: map is "exact content match maps to a value" (matching by content), while split_clients is "slice by hash value" (grouping by probability)—complex canary systems often chain the two: first use map to normalize messy characteristics (say, extracting a user identifier from different cookies), then feed it to split_clients for the ratio. One concatenation detail tripped me up during the experiment: branch values are case-sensitive—`"A"` produces the directory `version_A`, and any case mismatch in directory names means a 404/403. In testing, that was the very first pit I stepped on.

## Test 1: What a Given User Sees Is Fixed

What's applied to the characteristic string is a **deterministic hash**: the same IP with the same User-Agent yields the same hash every time, so whichever range it falls into is the version it gets forever. Fire three requests with the same UA, then one with a different UA:

![Figure 1](/images/csdn/figures/nginx-split-clients-csdn139325505-1.png)

The same characteristic stayed on VERSION A, the changed characteristic fell into group B—this is the data consistency A/B testing demands: a user doesn't see version A one moment and version B after a refresh.

## Test 2: Is the Ratio Trustworthy?

Whether the split is accurate, you only know by counting. Twenty different User-Agents simulated twenty independent users:

![Figure 2](/images/csdn/figures/nginx-split-clients-csdn139325505-2.png)

10 to 10—precisely even. Note that 50% is an **even split in the hash sense**: at small traffic volumes the group sizes will visibly deviate, and the larger the sample, the closer it gets to the configured ratio. Don't force conclusions out of small samples.

## Test 3: Changing the Ratio Reroutes Everyone

Changed the config from `50%` to `25%`, reloaded, and reran the tally:

![Figure 3](/images/csdn/figures/nginx-split-clients-csdn139325505-3.png)

The distribution across the 20 users became 4 to 16, matching the 25% setting. But the more important finding is something else: comparing each user's group before and after the change, user1, user10, user12, user14, user16, and user19—previously in group A—all fell into group B afterwards. **Changing the ratio doesn't "carve off a slice" of the existing grouping; it re-hashes every user**. Change the ratio midway through a running A/B test and the before/after data is no longer comparable; scaling up a canary has the same effect—some users will experience a "version jump."

To mitigate the jumping, the common approach is to switch the grouping key to a cookie that's randomly assigned at first visit and constant thereafter: `split_clients "${cookie_ab_group}" $variant { ... }`—existing users stay glued to their first group, and only new traffic without a cookie participates in the hash. The cost is introducing application-layer cooperation, plus you must handle the "empty characteristic string" edge case: requests without a cookie hash the empty string and all fall into the same bucket, which naturally clumps them into one group. Which value you feed into the characteristic string defines "who counts as the same user"—that's the part of this module that genuinely demands careful thought.

## Things to Watch Out For

- **The characteristic string must be stable**: the same user must stay in the same group for the entire test. Where IPs change (mobile networks, shared egress), prefer a more stable identifier, and if login state exists, add the user identifier to the characteristic string.
- **The ratio is an approximation**: 50% is an even split only in the hash sense; at low traffic the group sizes will visibly deviate. Check confidence before drawing conclusions on small samples.
- **Config changes require a reload and reroute everyone**: don't touch the ratio or the characteristic string midway through a running test (the rerouting effect was verified above).
- **The performance cost is tiny**: one extra hash computation per request, negligible under normal conditions.

## Summary

The three tests assemble a complete portrait of split_clients: grouping relies on a deterministic hash, stable enough that the same user never jumps versions; the ratio is trustworthy in the hash sense and approaches the configured value with large enough samples; the price is that any adjustment reroutes everyone—changing config midway through a test voids the data. It fits lightweight A/B and canary work where "the access layer slices traffic by ratio"; when you need strongly consistent grouping across requests (pinned cookies, login-state binding), it's time for the application layer to take over. Before go-live, fire a few requests with fixed User-Agents to confirm the grouping and the ratio—the fastest acceptance check for this module.

---

> This article was rewritten from the author's CSDN blog posts originally published between 2020 and 2024.
