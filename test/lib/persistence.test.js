// Focused unit tests for lib/persistence helpers whose attachment-key
// resolution must be composite-key safe. These intentionally exercise the REAL
// persistence module (sdm.test.js mocks it), mocking only @sap/cds/lib's query
// builder so we can assert the WHERE key used.

jest.mock("@sap/cds/lib", () => {
  const noopLog = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  return {
    ql: { SELECT: jest.fn(), UPDATE: jest.fn(), INSERT: jest.fn() },
    log: () => noopLog,
    env: {}
  };
});

const cds = require("@sap/cds/lib");
const { updateAttachmentInDraft } = require("../../lib/persistence");

describe("updateAttachmentInDraft - composite-key id resolution", () => {
  let setMock;
  let whereMock;

  beforeEach(() => {
    jest.clearAllMocks();
    whereMock = jest.fn().mockResolvedValue({ affectedRows: 1 });
    setMock = jest.fn(() => ({ where: whereMock }));
    cds.ql.UPDATE.mockReturnValue({ set: setMock });
  });

  it("writes the SDM url against the attachment's own key from data.ID (not the parent up__ID in the URL)", async () => {
    // Composite-key URL where the attachment ID comes FIRST and up__ID LAST.
    // The old greedy regex captured the LAST ID= (the parent), writing the url
    // to the wrong key and breaking later delete/discard in SDM.
    const req = {
      target: "my.MediaChild.drafts",
      req: {
        url: "/MediaChild(ID=5b486066-2e4c-47a9-a99d-29c9b9218aa4,up__ID=1cf0de7a-e2af-4b70-a844-b29708d8944b,IsActiveEntity=false)/content"
      },
      params: [
        { ID: "1cf0de7a-e2af-4b70-a844-b29708d8944b" },
        {
          ID: "5b486066-2e4c-47a9-a99d-29c9b9218aa4",
          up__ID: "1cf0de7a-e2af-4b70-a844-b29708d8944b"
        }
      ]
    };
    const data = {
      ID: "5b486066-2e4c-47a9-a99d-29c9b9218aa4",
      url: "d5e964fc-ae23-4d3d-8ef2-ae3da3678c05",
      folderId: "folder-1",
      type: "sap-icon://document"
    };

    await updateAttachmentInDraft(req, data);

    expect(cds.ql.UPDATE).toHaveBeenCalledWith(req.target);
    expect(setMock).toHaveBeenCalledWith({
      folderId: "folder-1",
      url: "d5e964fc-ae23-4d3d-8ef2-ae3da3678c05",
      status: "Clean",
      type: "sap-icon://document"
    });
    // Must target the attachment's own key, NOT the parent up__ID.
    expect(whereMock).toHaveBeenCalledWith({
      ID: "5b486066-2e4c-47a9-a99d-29c9b9218aa4"
    });
  });

  it("falls back to req.params.at(-1).ID when data.ID is absent", async () => {
    const req = {
      target: "my.MediaChild.drafts",
      req: { url: "/MediaChild(ID=att-xyz,up__ID=parent-1)/content" },
      params: [
        { ID: "parent-1" },
        { ID: "att-xyz", up__ID: "parent-1" }
      ]
    };
    const data = { url: "obj-id", folderId: "f", type: "t" }; // no ID

    await updateAttachmentInDraft(req, data);

    expect(whereMock).toHaveBeenCalledWith({ ID: "att-xyz" });
  });

  it("resolves the single-key (incidents-style) attachment id from data.ID", async () => {
    const req = {
      target: "ProcessorService.Incidents.attachments.drafts",
      req: {
        url: "/Incidents_attachments(up__ID=3583f982-d7df-4aad-ab26-301d4a157cd7,ID=8e2fbd1b-de5b-4738-81c3-6d547fb9ba9c,IsActiveEntity=false)/content"
      },
      params: [
        { ID: "3583f982-d7df-4aad-ab26-301d4a157cd7" },
        {
          ID: "8e2fbd1b-de5b-4738-81c3-6d547fb9ba9c",
          up__ID: "3583f982-d7df-4aad-ab26-301d4a157cd7"
        }
      ]
    };
    const data = {
      ID: "8e2fbd1b-de5b-4738-81c3-6d547fb9ba9c",
      url: "obj-abc",
      folderId: "folder-9",
      type: "sap-icon://document"
    };

    await updateAttachmentInDraft(req, data);

    expect(whereMock).toHaveBeenCalledWith({
      ID: "8e2fbd1b-de5b-4738-81c3-6d547fb9ba9c"
    });
  });
});
