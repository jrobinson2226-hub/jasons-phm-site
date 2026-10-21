// Roster used by the "Full name" suggestion box on lo-profile-builder.html.
//
// Type two or more letters of a first or last name and matching people appear.
// Picking one fills in the facts that live in a public record: name, title,
// company, NMLS IDs, contact details, license states and primary metro.
//
// It deliberately does NOT fill loan programs, borrower types, languages,
// credentials or "what you do differently" — those are judgment calls, they
// are what make the output any good, and nobody can answer them for someone
// else.
//
// To add someone: copy a block, keep the commas, keep the quotes.
// Confirm every NMLS ID at nmlsconsumeraccess.org before adding it. A wrong
// NMLS ID ends up in every piece of copy the tool writes.
// Only list people who are fine with their details being here. Everything in
// this file is public to anyone who opens the page.
//
// Fields: name, title, nmls, company, conmls, phone, email, site, office,
//         states (array), metro. Leave any of them as "" to skip.

window.LO_ROSTER = [
  {
    name:    "Jason Robinson",
    title:   "Sr. Loan Officer",
    nmls:    "1008330",
    company: "Prosperity Home Mortgage, LLC",
    conmls:  "75164",
    phone:   "(913) 687-7247",
    email:   "jason.robinson@phmloans.com",
    site:    "jasonhomeloan.com",
    office:  "",
    states:  ["Kansas", "Missouri"],
    metro:   "Kansas City metro, including Johnson County and the Northland"
  }
];
