// Stylized 2007-era social-app mock — purely decorative, lives inside the hero polaroid.
// Ported from design_handoff/Retrosite Home.html MockSite.

export function MockChirper() {
  const updates: Array<[string, string]> = [
    ["user_one", "Posting a quick update from the road…"],
    ["user_two", "Just finished the new patch."],
    ["user_three", "Coffee #3 of the day."],
    ["user_four", "Headed to the show tonight."],
    ["user_five", "Anyone tried the new build?"]
  ];

  return (
    <div className="mock-chirper">
      <div className="mock-chirper-header">
        <div className="mock-chirper-brand">chirper</div>
        <div className="mock-chirper-login">
          <span>username</span>
          <span>password</span>
          <span className="mock-chirper-login-btn">Log in</span>
        </div>
      </div>

      <div className="mock-chirper-body">
        <div className="mock-chirper-feed">
          <div className="mock-chirper-section-heading">What are your friends doing?</div>
          <div className="mock-chirper-tiles">
            {["?", "💬", "🌐"].map((glyph, i) => (
              <div key={i} className="mock-chirper-tile">
                <div className="mock-chirper-tile-glyph">{glyph}</div>
                <div className="mock-chirper-tile-copy">tile copy</div>
              </div>
            ))}
          </div>
          <div className="mock-chirper-section-heading">Recent updates</div>
          {updates.map(([name, text], i) => (
            <div key={i} className="mock-chirper-update">
              <div className="mock-chirper-avatar" />
              <div className="mock-chirper-update-body">
                <span className="mock-chirper-update-name">{name}</span>{" "}
                <span>{text}</span>
                <div className="mock-chirper-update-time">less than 5 seconds ago</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mock-chirper-side">
          <div className="mock-chirper-card mock-chirper-card--green">
            <div className="mock-chirper-card-heading mock-chirper-card-heading--green">Create Your Account</div>
            <div className="mock-chirper-join">Join!</div>
            <div className="mock-chirper-card-copy">Already using? Click here.</div>
          </div>
          <div className="mock-chirper-card">
            <div className="mock-chirper-card-heading">It's flexible</div>
            <div className="mock-chirper-card-copy">Stay connected in a variety of ways.</div>
            <ul className="mock-chirper-list">
              <li>Mobile</li>
              <li>Messages</li>
              <li>Desktop apps</li>
              <li>Web</li>
            </ul>
          </div>
          <div className="mock-chirper-card">
            <div className="mock-chirper-card-heading">Find people you know</div>
            <div className="mock-chirper-search">
              <div className="mock-chirper-search-input" />
              <div className="mock-chirper-search-btn">Search</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mock-chirper-footer">© 2007 chirper · About · Contact · Blog · API · Help · Terms · Privacy</div>
    </div>
  );
}
