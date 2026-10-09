import { ABI } from "@wireio/sdk-core"

/** Exact checked-in Andon ABI from Sysio #662 merge a16738c488e8a821f06e1fa7d3188b98f4e35207. */
export const SysioAndonAbi = ABI.from(`{
    "____comment": "This file was generated with sysio-abigen. DO NOT EDIT ",
    "version": "sysio::abi/1.2",
    "types": [],
    "structs": [
        {
            "name": "clear",
            "base": "",
            "fields": [
                {
                    "name": "note",
                    "type": "string"
                }
            ]
        },
        {
            "name": "cord_state",
            "base": "",
            "fields": [
                {
                    "name": "pulled",
                    "type": "bool"
                },
                {
                    "name": "when",
                    "type": "time_point"
                },
                {
                    "name": "reason",
                    "type": "string"
                }
            ]
        },
        {
            "name": "pull",
            "base": "",
            "fields": [
                {
                    "name": "reason",
                    "type": "string"
                }
            ]
        }
    ],
    "actions": [
        {
            "name": "clear",
            "type": "clear",
            "ricardian_contract": ""
        },
        {
            "name": "pull",
            "type": "pull",
            "ricardian_contract": ""
        }
    ],
    "tables": [
        {
            "name": "cord",
            "type": "cord_state",
            "index_type": "i64",
            "key_names": ["name"],
            "key_types": ["name"],
            "table_id": 28648
        }
    ],
    "ricardian_clauses": [],
    "variants": [],
    "action_results": []
}`)
